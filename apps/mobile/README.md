# FitFlow mobile (member + trainer app)

Planned for **Phase 2**. One Expo (React Native) app, with screens chosen by the logged-in role:

- **Members:** OTP login, membership status, pay and renew, QR check-in, class booking, workouts and diet, progress.
- **Trainers:** assigned clients, today's sessions, log workouts and measurements.

The API it needs already exists: `POST /v1/auth/otp/request` and `POST /v1/auth/otp/verify`
log a member in by phone, and `@fitflow/shared` has the schemas and types to reuse.

This folder is a placeholder until Phase 2. It will be created with `create-expo-app` at that
point so the Expo SDK and React Native versions match each other and the current release.
