FROM node:10

# Create working directory
WORKDIR /home/node/app

# Copy and prep node code
COPY package*.json ./

RUN npm i --no-optional

COPY . .

ENTRYPOINT ["node", "index.js"]
