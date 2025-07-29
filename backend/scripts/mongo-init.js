// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

// Switch to the application database
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'thatsmyplane-dev');

// Create application user with read/write access
db.createUser({
  user: process.env.MONGO_APP_USERNAME || 'app_user',
  pwd: process.env.MONGO_APP_PASSWORD || 'app_password',
  roles: [
    {
      role: 'readWrite',
      db: process.env.MONGO_INITDB_DATABASE || 'thatsmyplane-dev'
    }
  ]
});

// Create indexes for better performance
print('Creating indexes...');

// Users collection indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });

// Flights collection indexes
db.flights.createIndex({ userId: 1 });
db.flights.createIndex({ flightNumber: 1 });
db.flights.createIndex({ date: 1 });
db.flights.createIndex({ 'originAirport.iataCode': 1 });
db.flights.createIndex({ 'destinationAirport.iataCode': 1 });
db.flights.createIndex({ 'aircraft.tailNumber': 1 });
db.flights.createIndex({ createdAt: 1 });
db.flights.createIndex({ userId: 1, createdAt: -1 });

// Airlines collection indexes
db.airlines.createIndex({ iataCode: 1 }, { unique: true });
db.airlines.createIndex({ icaoCode: 1 }, { unique: true, sparse: true });
db.airlines.createIndex({ name: 1 });

// Airports collection indexes
db.airports.createIndex({ iataCode: 1 }, { unique: true });
db.airports.createIndex({ icaoCode: 1 }, { unique: true, sparse: true });
db.airports.createIndex({ name: 1 });
db.airports.createIndex({ city: 1 });
db.airports.createIndex({ country: 1 });

// Aircraft collection indexes
db.aircraft.createIndex({ tailNumber: 1 }, { unique: true });
db.aircraft.createIndex({ aircraftType: 1 });
db.aircraft.createIndex({ manufacturer: 1 });
db.aircraft.createIndex({ model: 1 });

print('Database initialization completed successfully!');
print('Created indexes for optimal query performance.');