DESTDIR?=
PREFIX?=/opt/circonus
MAN=$(PREFIX)/man/man8
SBIN=$(PREFIX)/sbin
BIN=$(PREFIX)/bin
LOG=$(PREFIX)/log
ETC=$(PREFIX)/etc
CONF=$(PREFIX)/etc/node-agent.d
MODULES=$(PREFIX)/lib/node_modules
NAD_LIB=$(MODULES)/nad
ifeq ($(wildcard /var/run),/var/run)
RUNSTATE_DIR=/var/run
else
RUNSTATE_DIR=$(PREFIX)/var/run
endif
RUNSTATE_FILE=$(RUNSTATE_DIR)/nad.pid
RUNSTATE_USER?=nobody
MANIFEST_DIR=/var/svc/manifest/network/circonus
METHOD_DIR=/var/svc/method
MAKE?=make

SYSTEMD_BIN=$(wildcard /bin/systemctl)
SYSTEMD_DIR=$(wildcard /lib/systemd/system)
UPSTART_BIN=$(wildcard /sbin/initctl)
UPSTART_DIR=$(wildcard /etc/init)

all:

install:	install-nad install-man install-plugins install-modules

install-dirs:
	./mkinstalldirs $(DESTDIR)$(BIN)
	./mkinstalldirs $(DESTDIR)$(SBIN)
	./mkinstalldirs $(DESTDIR)$(ETC)
	./mkinstalldirs $(DESTDIR)$(CONF)
	./mkinstalldirs $(DESTDIR)$(MODULES)
	./mkinstalldirs $(DESTDIR)$(NAD_LIB)
	./mkinstalldirs $(DESTDIR)$(MAN)
ifneq ($(RUNSTATE_DIR),/var/run)
	./mkinstalldirs $(DESTDIR)$(RUNSTATE_DIR)
	chown $(RUNSTATE_USER) $(DESTDIR)$(RUNSTATE_DIR)
endif

install-nad:	install-dirs
	/bin/sed -e "s#@@PREFIX@@#$(PREFIX)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" nad.sh > nad.sh.out
	./install-sh -c -m 0644 nad.js $(DESTDIR)$(SBIN)/nad.js
	./install-sh -c -m 0755 nad.sh.out $(DESTDIR)$(SBIN)/nad

install-man:	install-dirs
	./install-sh -c -m 0644 man/nad.8 $(DESTDIR)$(MAN)/nad.8

install-plugins:	install-dirs
	rsync -a plugins/ $(DESTDIR)$(CONF)/

install-modules:
	PATH="$(PATH):$(DESTDIR)$(PREFIX)/bin" npm install --no-progress
	rsync -a node_modules/ $(DESTDIR)$(MODULES)/
	rsync -a lib/* $(DESTDIR)$(NAD_LIB)/

install-illumos:	install
	/bin/sed \
		-e "s#@@PREFIX@@#$(PREFIX)#g" \
		-e "s#@@METHOD_DIR@@#$(METHOD_DIR)#g" \
		-e "s#@@CONF@@#$(CONF)#g" \
		smf/nad.xml > smf/nad.xml.out
	/bin/sed \
		-e "s#@@PREFIX@@#$(PREFIX)#g" \
		-e "s#@@CONF@@#$(CONF)#g" \
		smf/circonus-nad > smf/circonus-nad.out
	mkdir -p $(DESTDIR)$(MANIFEST_DIR)
	mkdir -p $(DESTDIR)$(METHOD_DIR)
	./install-sh -c -m 0644 smf/nad.xml.out $(DESTDIR)$(MANIFEST_DIR)/nad.xml
	./install-sh -c -m 0755 smf/circonus-nad.out $(DESTDIR)$(METHOD_DIR)/circonus-nad
	cd $(DESTDIR)$(CONF)/illumos ; $(MAKE)
	cd $(DESTDIR)$(CONF) ; for f in aggcpu.elf cpu.elf fs.elf zpoolio.elf if.sh iflink.sh sdinfo.sh smf.sh tcp.sh udp.sh vminfo.sh vnic.sh zfsinfo.sh zone_vfs.sh; do /bin/ln -sf illumos/$$f ; done
	cd $(DESTDIR)$(CONF) ; /bin/ln -sf common/zpool.sh

install-linux:	install
	./mkinstalldirs $(DESTDIR)$(LOG)
	/bin/sed -e "s#@@LOG@@#$(LOG)#g" linux-init/logrotate > linux-init/logrotate.out
	./install-sh -c -m 0644 linux-init/logrotate.out $(DESTDIR)/etc/logrotate.d/nad
	/bin/sed -e "s#@@CONF@@#$(CONF)#g" linux-init/defaults > linux-init/defaults.out
	./install-sh -c -m 0644 linux-init/defaults.out $(DESTDIR)$(ETC)/nad.conf
	/bin/sed -e "s#@@BIN@@#$(BIN)#g" -e "s#@@MODULES@@#$(MODULES)#g" -e "s#@@LOG@@#$(LOG)#g" bin/nad-log.sh > bin/nad-log.out
	./install-sh -c -m 0755 bin/nad-log.out $(DESTDIR)$(BIN)/nad-log
	cd $(DESTDIR)$(CONF)/linux ; $(MAKE)
	cd $(DESTDIR)$(CONF) ; for f in cpu.sh disk.sh diskstats.sh fs.elf if.sh vm.sh ; do /bin/ln -sf linux/$$f ; done
ifneq ($(wildcard /sbin/zpool),)
	cd $(DESTDIR)$(CONF) ; /bin/ln -sf common/zpool.sh
endif
ifneq ($(wildcard /usr/bin/systemctl),)
	cd $(DESTDIR)$(CONF) ; /bin/ln -sf linux/systemd.sh
endif

# init
install-ubuntu:	install-linux
ifneq ($(and $(SYSTEMD_BIN), $(SYSTEMD_DIR)),)
	/bin/sed -e "s#@@SBIN@@#$(SBIN)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" linux-init/systemd.service > linux-init/systemd.service.out
	./install-sh -c -m 0755 linux-init/systemd.service.out $(DESTDIR)/lib/systemd/system/nad.service
else ifneq ($(and $(UPSTART_BIN), $(UPSTART_DIR)),)
	/bin/sed -e "s#@@SBIN@@#$(SBIN)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" linux-init/upstart > linux-init/upstart.out
	./install-sh -c -m 0755 linux-init/upstart.out $(DESTDIR)/etc/init/nad.conf
else
	/bin/sed -e "s#@@PREFIX@@#$(PREFIX)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" linux-init/ubuntu-init > linux-init/ubuntu-init.out
	./install-sh -c -m 0755 linux-init/ubuntu-init.out $(DESTDIR)/etc/init.d/nad
endif

# init
install-rhel:	install-linux
ifneq ($(and $(SYSTEMD_BIN), $(SYSTEMD_DIR)),)
	/bin/sed -e "s#@@SBIN@@#$(SBIN)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" linux-init/systemd.service > linux-init/systemd.service.out
	./install-sh -c -m 0755 linux-init/systemd.service.out $(DESTDIR)/lib/systemd/system/nad.service
else ifneq ($(and $(UPSTART_BIN), $(UPSTART_DIR)),)
	/bin/sed -e "s#@@SBIN@@#$(SBIN)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" linux-init/upstart > linux-init/upstart.out
	./install-sh -c -m 0755 linux-init/upstart.out $(DESTDIR)/etc/init/nad.conf
else
	/bin/sed -e "s#@@PREFIX@@#$(PREFIX)#g" -e "s#@@PID_FILE@@#$(RUNSTATE_FILE)#g" linux-init/rhel-init > linux-init/rhel-init.out
	./install-sh -c -m 0755 linux-init/rhel-init.out $(DESTDIR)/etc/init.d/nad
endif

install-freebsd:	install
	for f in plugins/freebsd/*.sh ; do \
		filename=`echo "$${f}" | /usr/bin/sed -e 's#plugins/##'`; \
		/usr/bin/sed \
			-e "s#@@PREFIX@@#${PREFIX}#g" \
			-e "s#@@CONF@@#${CONF}#g" \
			$${f} > "${DESTDIR}${CONF}/$${filename}"; \
	done
	/usr/bin/sed \
		-e "s#@@PREFIX@@#${PREFIX}#g" \
		-e "s#@@CONF@@#${CONF}#g" \
		freebsd-init/nad > freebsd-init/nad.out
	./install-sh -d -m 0755 $(DESTDIR)$(PREFIX)/etc/init.d
	./install-sh -c -m 0755 freebsd-init/nad.out $(DESTDIR)$(PREFIX)/etc/rc.d/nad
	cd $(DESTDIR)$(CONF)/freebsd ; $(MAKE)
	cd $(DESTDIR)$(CONF) ; for f in cpu.sh disk.elf fs.elf if.sh vm.sh  ; do /bin/ln -sf freebsd/$$f ; done
	A=$(shell /sbin/sysctl kstat.zfs > /dev/null 2>&1 ; echo $$?)
ifeq ($(A),0)
	cd $(DESTDIR)$(CONF) ; /bin/ln -sf zfsinfo.sh ; \
	cd $(DESTDIR)$(CONF) ; /bin/ln -sf common/zpool.sh
endif

install-openbsd:	install
	cd $(DESTDIR)$(CONF)/openbsd ; $(MAKE)
	cd $(DESTDIR)$(CONF) ; for f in cpu.sh fs.elf if.sh ; do /bin/ln -sf openbsd/$$f ; done
	cd $(DESTDIR)$(CONF) ; /bin/ln -sf pf/pf.pl

clean:
	rm -f freebsd-init/*.out linux-init/*.out smf/*.out bin/nad-log.out nad.sh.out
