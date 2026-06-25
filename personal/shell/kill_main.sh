#!/usr/bin/env bash



#script must be run from /icebreaker directory

pwd_dir=${PWD##*/}

if [[ ! ${pwd_dir,,} == "icebreaker" ]]; then
    echo "script must be run from the icebreaker directory"
    exit 1
fi


#check if true argument has been given
if [ "$1" == "true" ]; then
    echo "keeping terminal open after killing processes"
    rm -f /tmp/icebreaker/admin_panel_window_id.txt
    #silent kill processes and close terminal for user convenience
fi

#get env contents:

if [ -s .env ]; then #ensure its not empty, cuz if it is then it freaks out and imports a ton of random crap
    export $(grep -v '^#' .env | xargs)
fi
server=$(printenv "ICEBREAKER_PORT");
admin=$(printenv "ICEBREAKER_ADMIN_PORT");


echo "$server" | ./personal/shell/kill_process.sh $ICEBREAKER_PORT;
echo "$admin" | ./personal/shell/kill_process.sh $ICEBREAKER_ADMIN_PORT;
echo -e "\e[1;32m\nProcesses killed successfully\n\e[0m"