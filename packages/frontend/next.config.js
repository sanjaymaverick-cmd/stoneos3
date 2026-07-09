/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: "standalone", // required for the production Docker image — see Dockerfile
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  },
};
