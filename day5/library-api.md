# Library API Design

A REST API for a library's **books** resource. All paths start with `/books`, all request and response bodies use JSON, and the base URL could be `https://api.examplelibrary.com`.

## Book object

- `id` - number, created by the server
- `title` - string
- `author` - string
- `year` - number
- `isbn` - string

## Endpoints

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns an array of every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book

- **Method:** `GET`
- **Path:** `/books/{id}` (for example `/books/7`)
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "isbn": "9780385474542"
}
```

- **Success status:** `201 Created`

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/books/{id}` (for example `/books/7`)
- **Description:** Replaces the details of an existing book.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1959,
  "isbn": "9780385474542"
}
```

- **Success status:** `200 OK`

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/{id}` (for example `/books/7`)
- **Description:** Removes the book with the given id.
- **Request body:** none
- **Success status:** `204 No Content`

### 6. List books by an author

- **Method:** `GET`
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the author given in the `author` query parameter.
- **Request body:** none
- **Success status:** `200 OK`

## Error codes

### 400 Bad Request

The request is invalid, so the server cannot process it.

- **Example:** `POST /books` with a body that has no `title`, or `GET /books/abc` where the id is not a number.

### 404 Not Found

The thing you asked for does not exist.

- **Example:** `GET /books/9999` when no book has the id 9999, or `DELETE /books/9999` for a book that was already removed.