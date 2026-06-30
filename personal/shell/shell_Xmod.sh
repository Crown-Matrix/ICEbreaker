#!/usr/bin/env bash

#script must be run from /icebreaker directory
pwd_dir="${PWD##*/}"
pwd_dir_lower=$(echo "$pwd_dir" | tr '[:upper:]' '[:lower:]')

if [[ ! ( "$pwd_dir_lower" == "icebreaker" || "$pwd_dir_lower" == "src" ) ]]; then
    echo "script must be run from the main directory"
    exit 1
fi

#gives all shell files in /shell directory execute permissions
find ./personal/shell/ -type f -name "*.sh" -exec chmod +x {} +
