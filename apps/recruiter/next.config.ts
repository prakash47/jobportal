import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  transpilePackages: [
    '@jobportal/ui',
    '@jobportal/db',
    '@jobportal/search',
    '@jobportal/auth',
    '@jobportal/types',
  ],
};

export default config;
