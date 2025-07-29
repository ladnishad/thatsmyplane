const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  
  const cookieOptions = {
    expires: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.register = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const { firstName, lastName, username, email, password } = req.body;

  // Check if user already exists with email
  const existingUserByEmail = await User.findOne({ email });
  if (existingUserByEmail) {
    return next(new AppError('User already exists with this email', 400));
  }

  // Check if username is already taken
  const existingUserByUsername = await User.findOne({ username });
  if (existingUserByUsername) {
    return next(new AppError('Username is already taken', 400));
  }

  // Create new user
  const newUser = await User.create({
    firstName,
    lastName,
    username,
    email,
    password,
  });

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const { email, password } = req.body;

  // Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // If everything ok, send token to client
  createSendToken(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

exports.protect = catchAsync(async (req, res, next) => {
  console.log('🔐 ===== AUTH MIDDLEWARE HIT =====');
  console.log('🔐 Request URL:', req.originalUrl);
  console.log('🔐 Request method:', req.method);
  console.log('🔐 Has cookies:', !!req.cookies && Object.keys(req.cookies).length > 0);
  console.log('🔐 Cookies:', req.cookies);
  console.log('🔐 Has auth header:', !!req.headers.authorization);
  console.log('🔐 Auth header:', req.headers.authorization?.substring(0, 20) + '...' || 'None');

  // 1) Getting token and check if it's there
  let token;
  if (req.cookies.jwt) {
    token = req.cookies.jwt;
    console.log('🔐 Token found in cookies');
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
    console.log('🔐 Token found in Authorization header');
  }

  if (!token) {
    console.log('🔐 ❌ No token found');
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  console.log('🔐 ✅ Token found, verifying...');

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token does no longer exist.', 401)
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // Grant access to protected route
  req.user = currentUser;
  next();
});

exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

exports.checkUsername = catchAsync(async (req, res, next) => {
  const { username } = req.params;

  if (!username || username.length < 3) {
    return next(new AppError('Username must be at least 3 characters long', 400));
  }

  // Check if username is available
  const existingUser = await User.findOne({ username: username.toLowerCase() });
  const isAvailable = !existingUser;

  res.status(200).json({
    status: 'success',
    data: {
      username,
      isAvailable,
    },
  });
});

exports.suggestUsernames = catchAsync(async (req, res, next) => {
  const { firstName, lastName } = req.body;

  if (!firstName || !lastName) {
    return next(new AppError('First name and last name are required', 400));
  }

  // Generate username suggestions
  const baseUsernames = [
    `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${lastName.charAt(0).toLowerCase()}`,
    `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 100)}`,
    `pilot_${firstName.toLowerCase()}`,
    `${firstName.toLowerCase()}_pilot`,
    `aviator_${firstName.toLowerCase()}`,
  ];

  // Check availability for each suggestion
  const suggestions = [];
  for (const baseUsername of baseUsernames) {
    const existingUser = await User.findOne({ username: baseUsername });
    if (!existingUser) {
      suggestions.push(baseUsername);
    }
    
    // Stop when we have 5 suggestions
    if (suggestions.length >= 5) break;
  }

  // If we still need more suggestions, add numbered variants
  if (suggestions.length < 5) {
    const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;
    for (let i = 1; i <= 100 && suggestions.length < 5; i++) {
      const numberedUsername = `${baseUsername}${i}`;
      const existingUser = await User.findOne({ username: numberedUsername });
      if (!existingUser) {
        suggestions.push(numberedUsername);
      }
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      suggestions,
    },
  });
}); 