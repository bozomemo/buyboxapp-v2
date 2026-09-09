# Disposable test box for doc 14 section 11.12/11.13 -- an Ubuntu 22.04 container with real
# systemd as PID 1, so installer/linux/*.sh's `systemctl` calls behave the way they would on a
# customer's machine, not the way they'd behave in a plain non-systemd container (where every
# `systemctl` call would just fail).
#
# This is test-only tooling. It is not part of the shipped package or its build pipeline
# (installer/linux/build-package.sh runs on a bare ubuntu-22.04 CI runner, no Docker involved).
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      systemd systemd-sysv \
      sudo curl git ca-certificates gnupg build-essential dpkg-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/log/*.log /var/log/journal \
    # Standard trick for running systemd inside a container: strip the units that assume a real
    # boot (getty consoles, mounting host filesystems already mounted by Docker) so systemd
    # doesn't spend its startup fighting them.
    && rm -f /lib/systemd/system/multi-user.target.wants/* \
       /etc/systemd/system/*.wants/* \
       /lib/systemd/system/local-fs.target.wants/* \
       /lib/systemd/system/sockets.target.wants/*udev* \
       /lib/systemd/system/sockets.target.wants/*initctl* \
       /lib/systemd/system/basic.target.wants/* \
       /lib/systemd/system/anaconda.target.wants/* 2>/dev/null || true

STOPSIGNAL SIGRTMIN+3
CMD ["/lib/systemd/systemd"]
