FROM python:3.12-slim

# System deps + Node 20
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    build-essential \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies first (layer cache)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy all source
COPY . .

# Build React app
RUN npm run build

RUN chmod +x production_start.sh

# Railway injects PORT at runtime; document the internal ML port too
EXPOSE 8080

CMD ["./production_start.sh"]
