# APOIS RLS SECURITY MATRIX

## 1. USER PROFILES (`public.users`)
| Operation | Passenger | Driver | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Own | Own | ALL | ALL | `id = auth.uid()` or admin role check. |
| **INSERT** | Restricted | Restricted | ALL | ALL | Only via `handle_new_user()` trigger or admin. |
| **UPDATE** | Own (Partial) | Own (Partial) | ALL | ALL | Cannot change `average_rating`, `total_ratings`, `blocked_at`. |
| **DELETE** | None | None | ALL | ALL | Protected operation. |

## 2. ROLES (`public.user_roles`)
| Operation | Passenger | Driver | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Own | Own | ALL | ALL | `user_id = auth.uid()` or admin. |
| **INSERT** | None | None | ALL | ALL | Protected. Trigger-only for users. |
| **UPDATE** | None | None | ALL | ALL | Protected. |
| **DELETE** | None | None | ALL | ALL | Protected. |

## 3. PASSENGER WALLETS (`public.passenger_wallets`)
| Operation | Passenger | Driver | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Own | None | ALL | ALL | `passenger_id = auth.uid()` or admin. |
| **INSERT** | None | None | ALL | ALL | Trigger-only. |
| **UPDATE** | None | None | ALL | ALL | Users CANNOT update balance. |
| **DELETE** | None | None | ALL | ALL | Protected. |

## 4. DRIVER PROFILES (`public.drivers`)
| Operation | Passenger | Driver | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Active Only | Own | ALL | ALL | Passengers see limited fields for active rides. |
| **UPDATE** | None | Own (Partial) | ALL | ALL | Driver cannot update `approval_status`, `subscription_status`, `rating`. |
| **INSERT** | None | Self | ALL | ALL | Only during registration. |
| **DELETE** | None | None | ALL | ALL | Protected. |

## 5. RIDES (`public.rides`)
| Operation | Passenger | Driver | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Own | Assigned | ALL | ALL | `passenger_id = auth.uid()` or `driver_id` check. |
| **INSERT** | Restricted | None | ALL | ALL | Strictly via `request-ride` EF or restricted insert. |
| **UPDATE** | Restricted | Restricted | ALL | ALL | No direct status/price overrides by users. |
| **DELETE** | None | None | ALL | ALL | Soft delete / cancelled_at only. |

## 6. NOTIFICATIONS (`public.notifications`)
| Operation | User | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Own | ALL | ALL | `user_id = auth.uid()` |
| **INSERT** | None | ALL | ALL | Clients cannot create notifications. |
| **UPDATE** | Read-status | ALL | ALL | Only update `read_at`. |
| **DELETE** | Own | ALL | ALL | Optional per UI requirement. |

## 7. REFERENCE TABLES (`ride_categories`, `tariff_rules`, `payment_methods`)
| Operation | User | Admin | Service Role | Policy Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | ALL | ALL | ALL | Publicly readable if `is_active = true`. |
| **INSERT** | None | ALL | ALL | Admin only. |
| **UPDATE** | None | ALL | ALL | Admin only. |
| **DELETE** | None | ALL | ALL | Admin only. |
