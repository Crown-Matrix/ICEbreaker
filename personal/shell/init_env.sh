#!/usr/bin/env bash

#script must be run from /icebreaker directory

pwd_dir=${PWD##*/}

if [[ ! ${pwd_dir,,} == "icebreaker" ]]; then
    echo "script must be run from the icebreaker directory"
    exit 1
fi

#create .env file if it does not exist
touch .env
result=$?


if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    if [ -n "$result" ]; then
    echo -e "\n.env file created successfully."
    fi
else
    #only show output if there is an error, otherwise be silent
    if [ "$result" -ne 0 ]; then
    echo -e "\nError creating .env file."
    fi
fi