FROM nginx:1.27-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY site/ /usr/share/nginx/html/bfa/
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
