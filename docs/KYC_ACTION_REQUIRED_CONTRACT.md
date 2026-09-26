# KYC action-required contract

This contract lets an admin ask a user for more verification information without approving or rejecting the account outright. It uses existing KYC/user storage and does not require a new migration.

## Admin endpoints

Both endpoints perform the same action:

```http
POST /admin/kyc/:userId/request-information
POST /admin/kyc/:userId/request-more-info
Authorization: Bearer <admin access token>
Content-Type: application/json
```

Request example:

```json
{
  "reason": "Proof of address is unclear",
  "missingRequirements": ["proof of address", "liveness-check"],
  "message": "Please upload a clearer proof of address."
}
```

Response example:

```json
{
  "status": "ACTION_REQUIRED",
  "kycStatus": "RETRY_REQUIRED",
  "accountLevel": 2,
  "message": "Additional KYC information has been requested.",
  "missingRequirements": ["proof_of_address", "liveness_check"],
  "user": {
    "id": "user-1",
    "kycStatus": "RETRY_REQUIRED"
  },
  "kyc": {
    "status": "RETRY_REQUIRED",
    "statusMessage": "Please upload a clearer proof of address.",
    "actionRequired": true,
    "missingRequirements": ["proof_of_address", "liveness_check"],
    "limits": {
      "accountProgressLevel": 2
    }
  },
  "notification": {
    "status": "QUEUED"
  }
}
```

`missingRequirements` are normalized to lower-case underscore keys so mobile and admin can route consistently.

## Mobile-visible status

The user can read the action-required state through:

```http
GET /kyc/status
GET /user/me
GET /user/home
```

Relevant response fields:

```json
{
  "status": "RETRY_REQUIRED",
  "statusMessage": "Please upload a clearer proof of address.",
  "actionRequired": true,
  "missingRequirements": ["proof_of_address", "liveness_check"],
  "limits": {
    "accountProgressLevel": 2
  }
}
```

Account level response uses:

```json
{
  "code": "KYC_ACTION_REQUIRED",
  "level": 2,
  "rank": 2,
  "status": "LIMITED",
  "actionRequired": true,
  "missingRequirements": ["proof_of_address", "liveness_check"]
}
```

## Notification behavior

When notification storage exists, the backend creates a KYC notification with metadata:

```json
{
  "category": "KYC",
  "metadata": {
    "status": "RETRY_REQUIRED",
    "screen": "KYC",
    "actionRequired": true,
    "missingRequirements": ["proof_of_address", "liveness_check"]
  }
}
```

If notification storage is missing in a legacy database, the admin endpoint still updates the user's KYC status and returns `notification.status` as `STORAGE_UNAVAILABLE`.

## Mobile handling

Mobile should treat `RETRY_REQUIRED` as an editable KYC state:

- show "More information required";
- show `statusMessage`;
- list `missingRequirements`;
- route the user back to the KYC/MetaMap flow;
- keep provider-backed features restricted until status becomes `VERIFIED`.
