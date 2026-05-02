# Campus Notification Platform & Vehicle Maintenance Scheduler

This repository contains the backend implementation for two main microservices:

## 1. Vehicle Maintenance Scheduler
An optimal scheduling algorithm that selects which vehicles to service within a specific mechanic-hours budget. It uses the 0/1 Knapsack approach to maximize the operational impact score of the serviced vehicles without exceeding the daily hour limit.

To run:
```bash
cd vehicle_maintence_scheduler
npm install
node index.js
```

## 2. Campus Notifications Microservice
A RESTful API to manage student notifications regarding Placements, Events, and Results. 
It also includes a real-time Priority Inbox script that ranks notifications based on their type weight and recency decay.

To run the server:
```bash
cd notification_app_be
npm install
npm start
```

To run the Priority Inbox script:
```bash
cd notification_app_be
node priority_inbox.js
```

## 3. Logging Middleware
A reusable package utilized by both microservices to send structured logs to the central evaluation server.

## 4. System Design
The `notification_system_design.md` file contains the REST API contract, database schema, performance optimizations (indexes, caching strategies), message queue redesign, and Priority Inbox logic spanning multiple stages of the project.
