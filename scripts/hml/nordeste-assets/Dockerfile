ARG BASE_IMAGE=ubuntu:24.04
FROM ${BASE_IMAGE}
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openjdk-21-jre-headless osmium-tool python3 ca-certificates curl time && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/apois && curl -fsSL --proto '=https' --proto-redir '=https' --max-time 300 https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar -o /opt/apois/planetiler.jar && printf '%s  %s\n' f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d /opt/apois/planetiler.jar | sha256sum -c -
COPY nordeste-cartography/nordeste.yml nordeste-cartography/nordeste-style.json nordeste-cartography/verify-nordeste-archive.py nordeste-address/build_index.py nordeste-address/test_index.py nordeste-assets/build-assets.sh /opt/apois/
RUN chmod -R a+rX /opt/apois && chmod 755 /opt/apois/build-assets.sh && PYTHONDONTWRITEBYTECODE=1 python3 /opt/apois/test_index.py && bash -n /opt/apois/build-assets.sh
ENV HOME=/tmp TMPDIR=/tmp PYTHONDONTWRITEBYTECODE=1
USER 10001
ENTRYPOINT ["/bin/bash","/opt/apois/build-assets.sh"]
