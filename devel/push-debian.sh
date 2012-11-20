#!/bin/bash
DIR=$(dirname $0)
ROOT=$(cd $DIR/.. ; pwd -P)

host=debian04.pl.sophia.inria.fr

rsync -a "$@" --exclude '*.sqlite3' $ROOT/ root@$host:/root/myslice/
