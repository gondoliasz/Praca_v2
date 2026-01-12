# Dockerfile for backend (Python + R + rpy2)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common dirmngr gnupg apt-transport-https ca-certificates wget unzip \
    build-essential libssl-dev libxml2-dev libcurl4-openssl-dev wget locales \
    && rm -rf /var/lib/apt/lists/*

# Install R
RUN apt-get update && apt-get install -y --no-install-recommends r-base r-base-dev && rm -rf /var/lib/apt/lists/*

# Setup working dir
WORKDIR /app

# Copy backend code
COPY backend /app/backend
COPY r_scripts /app/r_scripts

# Install Python + pip
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

# Install Python requirements
RUN pip3 install --upgrade pip
RUN pip3 install -r /app/backend/requirements.txt

# Install required R packages
RUN R -e "install.packages(c('ggplot2','corrplot','psych'), repos='https://cloud.r-project.org')"

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]