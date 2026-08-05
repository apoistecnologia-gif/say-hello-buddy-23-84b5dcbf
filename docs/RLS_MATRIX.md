# RLS Policy Matrix - APOIS Passenger

| Table | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **users** | Own profile \| Admin | Admin/Trigger | Own profile (limited) | Admin |
| **user_roles** | Own role \| Admin | Admin | Admin | Admin |
| **passenger_wallets**| Own wallet \| Admin | Admin/Trigger | Admin/Service Role | Admin |
| **drivers** | Own profile \| Admin \| Public (limited) | Admin | Own profile (limited) | Admin |
| **rides** | Own (Pass/Driver) \| Admin | Passenger (JWT) | Owner (limited) \| Admin | Admin |
| **cancellation_fees** | Own fees \| Admin | Admin/Service Role | Admin | Admin |
| **notifications** | Own notifications \| Admin | Admin/Service Role | Own (read status) | Admin |
| **payment_methods** | Public (Active) | Admin | Admin | Admin |
| **ride_categories** | Public (Active) | Admin | Admin | Admin |
| **tariff_rules** | Public (Active) | Admin | Admin | Admin |

## Security Requirements

### USERS
- **Users**: Read and update only their own profile.
- **Admins**: Read all records.
- **Constraints**: Role information is protected via `user_roles`.

### USER_ROLES
- **Users**: Read their own role via `auth.uid() = user_id`.
- **Admins**: Manage all roles.
- **Restrictions**: No direct user modification.

### PASSENGER_WALLETS
- **Passengers**: Read only their own wallet.
- **Balance**: Updates restricted to service role or protected functions.

### DRIVERS
- **Drivers**: Read/update own profile (excluding `approval_status`, `subscription_status`).
- **Admins**: Full management.
- **Location**: Updates restricted to the owning driver.

### RIDES
- **Participants**: Passengers and assigned Drivers can read ride details.
- **Creation**: Authenticated passengers only.
- **State**: Transitions managed by backend logic/Edge Functions.

### REFERENCE TABLES
- **Public**: `payment_methods`, `ride_categories`, `tariff_rules` are readable if `is_active = true`.
- **Management**: Restricted to Admin role.
