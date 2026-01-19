FROM alpine:3.19

RUN apk add --no-cache git

# Create user with UID 1000 to match code-server's coder user
RUN adduser -D -u 1000 coder

COPY clone.sh /clone.sh
RUN chmod +x /clone.sh

WORKDIR /workspace
RUN chown coder:coder /workspace

USER coder

ENTRYPOINT ["/clone.sh"]
