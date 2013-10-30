SHELL = /bin/bash

MAKE-SILENT = $(MAKE) --no-print-directory

all: static templates

# clean up and recompute
redo: clean-oldies redo-static redo-templates 

clean-oldies:
	rm -rf all-static all-templates django-static 

force:

DESTDIR := /
datadir := /usr/share
bindir := /usr/bin

PWD := $(shell pwd)

# 
build: static templates force
	python setup.py build

install: 
	python setup.py install \
	    --install-purelib=$(DESTDIR)/$(datadir)/unfold \
	    --install-scripts=$(DESTDIR)/$(datadir)/unfold \
	    --install-data=$(DESTDIR)/$(datadir)/unfold

#################### third-party layout is managed as art of collectstatic
static: force
	./manage.py collectstatic --noinput

clean-static:
	rm -rf static/

redo-static: clean-static static

####################
# general stuff
DATE=$(shell date -u +"%a, %d %b %Y %T")

# This is called from the build with the following variables set 
# (see build/Makefile and target_debian)
# (.) RPMTARBALL
# (.) RPMVERSION
# (.) RPMRELEASE
# (.) RPMNAME
DEBVERSION=$(RPMVERSION).$(RPMRELEASE)
DEBTARBALL=../$(RPMNAME)_$(DEBVERSION).orig.tar.bz2

debian: static templates debian/changelog debian.source debian.package

debian/changelog: debian/changelog.in
	sed -e "s|@VERSION@|$(DEBVERSION)|" -e "s|@DATE@|$(DATE)|" debian/changelog.in > debian/changelog

debian.source: force 
	rsync -a $(RPMTARBALL) $(DEBTARBALL)

debian.package:
	debuild -uc -us -b 

debian.clean:
	$(MAKE) -f debian/rules clean
	rm -rf build/ MANIFEST ../*.tar.gz ../*.dsc ../*.build
	find . -name '*.pyc' -delete


# having templates in a templates/ subdir is fine most of the time except for plugins
plugins-templates: force
	@find plugins -type f -name '*.html' 
local-templates: force
	@$(foreach tmpl,$(shell find . -name templates | grep -v '^\./templates$$'),ls -1 $(tmpl)/*;)

list-templates: plugins-templates local-templates

#################### manage templates for the plugin area
templates: force
	mkdir -p templates
	ln -sf $(foreach x,$(shell $(MAKE-SILENT) list-templates),../$(x)) ./templates

clean-templates templates-clean: force
	rm -rf ./templates

redo-templates: clean-templates templates

####################
### list-all list-resources: list-templates list-js list-css list-img

#################### compute emacs tags
# list files under git but exclude third-party stuff like bootstrap and jquery
myfiles: force
	@git ls-files | egrep -v 'insert(_|-)above|third-party/|play/'

# in general it's right to rely on the contents as reported by git
tags: force
	$(MAKE-SILENT) myfiles | xargs etags

# however sometimes we have stuff not yet added, so in this case
ftags: force
	find . -type f | fgrep -v '/.git/' | xargs etags

#################### sync : push current code on a (devel) box running myslice
SSHURL:=root@$(MYSLICEBOX):/
SSHCOMMAND:=ssh root@$(MYSLICEBOX)

### rsync options
# the config file should probably not be overridden ??
# --exclude settings.py 
LOCAL_RSYNC_EXCLUDES	:= --exclude '*.pyc' --exclude config.py --exclude static --exclude templates --exclude '*.sqlite3'  --exclude play/ 
# usual excludes
RSYNC_EXCLUDES		:= --exclude .git --exclude '*~' --exclude TAGS --exclude .DS_Store $(LOCAL_RSYNC_EXCLUDES) 
# make -n will propagate as rsync -n 
RSYNC_COND_DRY_RUN	:= $(if $(findstring n,$(MAKEFLAGS)),--dry-run,)
# putting it together
RSYNC			:= rsync -a -v $(RSYNC_COND_DRY_RUN) $(RSYNC_EXCLUDES)

##### convenience for development only, push code on a specific test box
# xxx until we come up with a packaging this is going to be a wild guess
# on debian04 I have stuff in /usr/share/myslice and a symlink in /root/myslice
#INSTALLED=/usr/share/myslice
INSTALLED=/root/myslice

sync:
ifeq (,$(MYSLICEBOX))
	@echo "you need to set MYSLICEBOX, like in e.g."
	@echo "  $(MAKE) MYSLICEBOX=debian04.pl.sophia.inria.fr "$@""
	@exit 1
else
	+$(RSYNC) ./ $(SSHURL)/$(INSTALLED)/
endif

# xxx likewise until we run this under apache it's probably hard to restart from here
restart:
ifeq (,$(MYSLICEBOX))
	@echo "you need to set MYSLICEBOX, like in e.g."
	@echo "  $(MAKE) MYSLICEBOX=debian04.pl.sophia.inria.fr "$@""
	@exit 1
else
	@echo "$@" target not yet implemented - for an apache based depl it would read ...; exit; @$(SSHCOMMAND) /etc/init.d/apache2 restart
endif
