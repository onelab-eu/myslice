### 
all: 
	@echo no default target

force:

#################### compute emacs tags
# in general it's right to rely on the contents as reported by git
tags: force
	git ls-files | xargs etags

# however sometimes we have stuff not yet added, so in this case
ftags: force
	find . -type f | fgrep -v '/.git/' | xargs etags

#################### manage static contents (extract from all the modules into the single all-static location)
static: force
	./manage.py collectstatic --noinput 

clean-static: force
	rm -rf ./all-static/

#################### sync : push current code on a (devel) box running myslice
SSHURL:=root@$(MYSLICEBOX):/
SSHCOMMAND:=ssh root@$(MYSLICEBOX)

### rsync options
# the config file should probably not be overridden
LOCAL_RSYNC_EXCLUDES	:= --exclude '*.pyc' --exclude settings.py --exclude devel
# usual excludes
RSYNC_EXCLUDES		:= --exclude .git --exclude '*~' --exclude TAGS --exclude .DS_Store $(LOCAL_RSYNC_EXCLUDES) 
# make -n will propagate as rsync -n 
RSYNC_COND_DRY_RUN	:= $(if $(findstring n,$(MAKEFLAGS)),--dry-run,)
# putting it together
RSYNC			:= rsync -a -v $(RSYNC_COND_DRY_RUN) $(RSYNC_EXCLUDES)

# xxx until we come up with a packaging this is going to be a wild guess
INSTALLED=/usr/share/myslice

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
	@echo "$@" target not yet implemented; exit; @$(SSHCOMMAND) /etc/init.d/apache2 restart
endif

