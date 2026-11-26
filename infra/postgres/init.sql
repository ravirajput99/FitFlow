-- Creates the FitFlow application role and database.
-- Run once as a PostgreSQL superuser (docker compose does this automatically).
--
-- The app must NOT connect as a superuser: superusers bypass row-level security,
-- which would silently switch off FitFlow's database-level tenant isolation.
-- CREATEDB is only needed so `prisma migrate dev` can create its shadow database.
CREATE ROLE fitflow WITH LOGIN PASSWORD 'fitflow' CREATEDB NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE fitflow OWNER fitflow;
