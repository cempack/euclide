# euclide.elliotmoreau.fr on Railway. Node alone: no dependency to install.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
# The SQLite file lives on the volume mounted here (DATA_DIR).
ENV DATA_DIR=/data
# Root, as Railway mounts the volume: a user without rights could not write it.
EXPOSE 3000
CMD ["node", "server.js"]
