FROM alpine:3.19

RUN apk add --no-cache git

COPY clone.sh /clone.sh
RUN chmod +x /clone.sh

WORKDIR /workspace

ENTRYPOINT ["/clone.sh"]
