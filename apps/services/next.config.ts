import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  transpilePackages: [
    '@jobportal/ui',
    '@jobportal/auth',
    '@jobportal/types',
  ],
};

export default config;
