# =============================================================================
#  bfa-grupo — página ponte estática servida por nginx sob o path /bfa-grupo
# =============================================================================
FROM nginx:1.27-alpine

# limpa o conteúdo default do nginx
RUN rm -rf /usr/share/nginx/html/*

# o site vive sob /bfa-grupo porque o Traefik entrega o path completo ao container
COPY site/ /usr/share/nginx/html/bfa-grupo/

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
