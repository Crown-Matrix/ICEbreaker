#!/usr/bin/env bash

#script must be run from /icebreaker directory
pwd_dir=${PWD##*/}

if [[ ! (${pwd_dir,,} == "icebreaker" || ${pwd_dir,,} == "src") ]]; then
    echo "script must be run from the main directory"
    exit 1
fi

#gives all shell files in /shell directory execute permissions
find ./personal/shell/ -type f -name "*.sh" -exec chmod +x {} +
