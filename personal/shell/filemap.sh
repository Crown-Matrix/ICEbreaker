#!/usr/bin/env bash

find . -not -path '*/node_modules/*' -not -path '*/.git/*' | sed 's|[^/]*/|  |g' > personal/folder_map.txt
echo "Successfully generated folder map at personal/folder_map.txt"