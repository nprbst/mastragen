FROM oven/bun:1-alpine

# Use the existing bun user (UID 1000) which matches code-server's coder user

RUN apk add --no-cache git

COPY clone.sh /clone.sh
RUN chmod +x /clone.sh

WORKDIR /workspace
RUN chown bun:bun /workspace

USER bun

ENTRYPOINT ["/clone.sh"]
