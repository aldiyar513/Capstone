# API Specification

Status: Planned
Scope: Sprint 1
Base path: /api/v1

## Conventions

- Requests and responses use JSON, except audio uploads.
- IDs are UUID strings.
- Dates use ISO 8601 timestamps in UTC.
- Audio positions and durations use milliseconds.
- Protected endpoints require:
  Authorization: Bearer <access_token>
- The backend identifies the user from the verified access token.
  Clients do not supply owner_id or author_id.
- Users can access only their own pieces, recordings, and comments.

## Error format

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required."
  }
}

## Common status codes

| Code | Meaning |
|---|---|
| 200 | Request succeeded |
| 201 | Resource created |
| 204 | Resource deleted; no response body |
| 400 | Invalid request |
| 401 | Missing or invalid authentication |
| 404 | Resource does not exist or is not accessible to this user |
| 413 | Uploaded file exceeds the configured size limit |
| 415 | Unsupported audio format |
| 500 | Unexpected server error |
| 503 | A required service is temporarily unavailable |

## Endpoint overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /health | Check whether the API is running |
| POST | /pieces | Create a piece or exercise |
| GET | /pieces | List the current user's pieces |
| GET | /pieces/{piece_id} | Get one piece |
| PATCH | /pieces/{piece_id} | Update a piece |
| POST | /pieces/{piece_id}/recordings | Upload a recording |
| GET | /pieces/{piece_id}/recordings | List recording history |
| GET | /recordings/{recording_id} | Get recording details |
| GET | /recordings/{recording_id}/playback-url | Get a temporary audio playback URL |
| POST | /recordings/{recording_id}/comments | Create a timestamped comment |
| GET | /recordings/{recording_id}/comments | List timestamped comments |
| PATCH | /comments/{comment_id} | Edit a comment |
| DELETE | /comments/{comment_id} | Delete a comment |

All paths above are relative to /api/v1.
All endpoints except /health require authentication.