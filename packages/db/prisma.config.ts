// Prisma 7 config — replaces the old datasource env() pattern.
// .env files are NOT auto-loaded by Prisma 7; dotenv/config handles that.

import 'dotenv/config';

export default {
  schema: './prisma/schema.prisma',
};
