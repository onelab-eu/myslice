#!/usr/bin/env python
rm myslice.sqlite3
./manage.py syncdb
./manage.py migrate portal
