# Language Rules

## UI Language
- The UI must remain in Bahasa Indonesia. Do not change existing Indonesian text unless it is broken.
- All user-facing strings (labels, messages, errors) must be in Bahasa Indonesia.
- Use `<html lang="id">`, `id-ID` locale, IDR currency formatting.
- Map Supabase/library errors to Indonesian before displaying to users; never show raw Supabase error text.

## Code Language
- All code, comments, commit messages, README, and documentation must be in English.
- Variable names, function names, and technical identifiers in English.
- Error messages in code (developer-facing) in English.

## Error Handling
- User-facing error messages must be mapped to Indonesian.
- Developer/console logs may be in English.
