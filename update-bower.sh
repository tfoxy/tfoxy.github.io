#!/bin/sh
(cd b; bower --allow-root update);
git commit -am "Update b folder";
git push;
