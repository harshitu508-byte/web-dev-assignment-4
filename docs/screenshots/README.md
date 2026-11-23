# Postman screenshots

These are real captures from the supplied Postman test session. The screenshots showing credentials or bearer tokens have been redacted before inclusion.

Included:
- Successful login (`200 OK`)
- Duplicate signup rejection (`409 Conflict`, expected duplicate-user behavior)
- Login with existing user (`200 OK`)
- Empty notes list (`200 OK`)
- Note creation (`201 Created`)
- Notes list after creation (`200 OK`)
- Read note by ID (`200 OK`)
- Update note (`200 OK`)
- Subsequent notes-list response (`200 OK`)

The original login screenshots exposed JWT bearer tokens and test passwords. Treat that token as exposed; do not reuse it. Do not upload original unredacted screenshots.
