FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

ENV HOST=0.0.0.0
ENV PORT=3000
ENV OLLAMA_BASE_URL=http://ollama:11434
ENV OLLAMA_MODEL=qwen2.5:1.5b

EXPOSE 3000
USER node
CMD ["npm", "start"]
