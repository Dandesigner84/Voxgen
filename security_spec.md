# Security Specification for VoxGen AI

## Data Invariants
- Users can only read/edit their own profiles.
- Premium codes are read-only for users (unless redeeming) and manageable by admins.
- Redumption of a code must be atomic (mark as used, assign to user).
- Corporate content is readable by members (verified via `adminId` or shared membership). For now, we'll use a simple `adminId` check for ownership and allow read access if the user's role is `corporate-user` with association (simplified as global read for role-matched users or specific logic).
- Custom voices are private to the creator.

## The "Dirty Dozen" Payloads (Denial Tests)
1. Unauthorized update to another user's plan.
2. Creating a premium code as a regular user.
3. Redeeming a code that is already used.
4. Changing the `redeemedBy` field on a code once set.
5. Deleting a user profile as a non-admin.
6. Injecting a massive string into `User.name`.
7. Accessing `corporateContent` without a valid corporate role.
8. Modifying `narrationsToday` beyond logical limits.
9. Impersonating an admin via email spoofing (no `email_verified`).
10. Creating a `CustomVoice` for another user.
11. Updating `createdAt` timestamp.
12. Fetching all users as a regular user.

## Test Runner logic
- All these should return `PERMISSION_DENIED`.
