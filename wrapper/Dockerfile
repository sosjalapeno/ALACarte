FROM debian:stable-slim

ENV args=""

RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*

COPY ./rootfs /app/rootfs
COPY ./wrapper /app
COPY ./strtok_fix.c /app
WORKDIR /app

RUN gcc -shared -fPIC -O2 -o /app/libwrapper_strtok_fix.so /app/strtok_fix.c -ldl

CMD ["bash", "-c", "/app/wrapper $args"]

EXPOSE 10020 20020 30020
