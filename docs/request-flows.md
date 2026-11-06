# Application request flows


## Authentication flow

Supabase authenticates the user and returns a session.
React sends the access token with protected API requests.
Flask verifies the token and checks ownership before returning private data.

```mermaid
sequenceDiagram
    actor User
    participant React as React frontend
    participant Auth as Supabase Auth
    participant Flask as Flask backend
    participant DB as PostgreSQL

    User->>React: Enter email and password
    React->>Auth: Request login

    alt Credentials accepted
        Auth-->>React: Session and access token
        React-->>User: Show signed-in interface
    else Credentials rejected
        Auth-->>React: Authentication error
        React-->>User: Display error message
    end

    opt User requests protected data
        React->>Flask: API request with Bearer token
        Flask->>Auth: Verify token and retrieve user

        alt Token is valid
            Auth-->>Flask: Authenticated user identity
            Flask->>DB: Query records owned by user
            DB-->>Flask: Matching records
            Flask-->>React: JSON response
            React-->>User: Display data
        else Token is invalid or expired
            Auth-->>Flask: Verification failed
            Flask-->>React: Reject request
            React-->>User: Display authentication error
        end
    end
```

Authentication identifies the user. Ownership checks determine which
pieces, recordings and comments that user may access.

## Recording upload flow

React sends the audio file and recording title to Flask as form data.
Flask validates the request and checks ownership before saving the upload.

```mermaid
flowchart TD
    A["Select audio and enter a title"] --> B["React checks title, extension and size"]
    B --> C{"Frontend checks pass?"}
    C -->|No| D["Display validation error"]
    C -->|Yes| E["Send file, title and token to Flask"]
    E --> F["Flask verifies authentication"]
    F --> G{"Authenticated?"}
    G -->|No| H["Reject request"]
    G -->|Yes| I["Validate upload and check piece ownership"]
    I --> J{"Valid and authorized?"}
    J -->|No| H
    J -->|Yes| K["Save audio in R2 and recording metadata in PostgreSQL"]
    K --> L{"Save successful?"}
    L -->|No| M["Return upload error"]
    L -->|Yes| N["Return successful response"]
    N --> O["React refreshes the recording list"]
```

The save step includes two separate operations:
storing the audio in R2 and storing its metadata in PostgreSQL.
These services do not share a single database transaction.

Frontend validation provides immediate feedback.
Backend validation enforces the upload rules.

Upload progress measures transfer from the browser to Flask.
Reaching 100% does not necessarily mean storage and database saving
have finished.

## Audio playback flow

Flask checks access to the recording and generates a signed playback URL
valid for 15 minutes. The browser retrieves the audio directly from R2.

```mermaid
sequenceDiagram
    actor User
    participant React as React frontend
    participant Flask as Flask backend
    participant DB as PostgreSQL
    participant R2 as Cloudflare R2

    User->>React: Open recording
    React->>Flask: GET playback-url with access token
    Flask->>Flask: Verify authentication
    Flask->>DB: Find recording and check piece ownership
    DB-->>Flask: Access result and recording metadata

    alt User is authorized
        Flask->>Flask: Generate signed URL using storage key
        Flask-->>React: Playback URL valid for 15 minutes
        React->>R2: Audio player requests signed URL
        R2->>R2: Validate signature and expiry

        alt Signed request is valid
            R2-->>React: Audio data
            React-->>User: Play recording
        else Signed request is rejected
            R2-->>React: Access error
            React-->>User: Display reload message
        end
    else User is not authorized
        Flask-->>React: Reject playback request
        React-->>User: Display error message
    end
```

Flask generates the signed URL without downloading the audio.
The R2 bucket remains private.

The expiry limits when the URL can authorize a new request.
It does not guarantee that playback stops exactly 15 minutes
after the URL was issued.

## Timestamped comments flow

React captures the player's current position and converts it from seconds
to milliseconds. Flask validates the request and saves the comment
against the recording and authenticated author.

```mermaid
sequenceDiagram
    actor User
    participant React as React frontend
    participant Flask as Flask backend
    participant DB as PostgreSQL

    User->>React: Select Add comment here
    React->>React: Pause audio and capture current time
    React->>React: Convert seconds to milliseconds
    User->>React: Enter comment text and save
    React->>Flask: POST comment with text, timestamp and token
    Flask->>Flask: Verify authentication and validate input
    Flask->>DB: Check access to recording
    DB-->>Flask: Access result

    alt User is authorized and input is valid
        Flask->>DB: Insert comment with recording and author IDs
        DB-->>Flask: Saved comment
        Flask-->>React: Return saved comment
        React->>React: Insert comment in timestamp order
        React-->>User: Display comment
    else Request is rejected
        Flask-->>React: Error response
        React-->>User: Display error and retain draft
    end

    opt User refreshes or reopens the recording
        React->>Flask: GET comments with access token
        Flask->>Flask: Verify authentication
        Flask->>DB: Check ownership and retrieve comments
        DB-->>Flask: Saved comments
        Flask-->>React: Comments as JSON
        React-->>User: Display saved comments
    end

    User->>React: Click a comment timestamp
    React->>React: Convert milliseconds to seconds
    React->>React: Set audio currentTime
    React-->>User: Player moves to the selected moment
```

Selecting an already loaded comment does not require a Flask API request.
The browser updates the player position locally. Seeking may cause
the audio player to request additional audio data from R2.