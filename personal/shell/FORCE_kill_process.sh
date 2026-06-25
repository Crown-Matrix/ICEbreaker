#!/usr/bin/env bash
#can be dangerous, due to the -9 flag, so be careful when using this
wi
script_input="none" #assume none

if [ -n "$1" ]; then
    #argument provided
    script_input="$1"
elif [ ! -t 0 ]; then
    script_input=$(cat) #read from stdin
fi

if [ "$script_input" == "none" ]; then
    echo "no input provided, exiting"
    exit 1
fi


#kill process by name or pid
echo $(lsof -ti:"$script_input" || echo "no process found with name or pid: $script_input")

lsof -ti:"$script_input" | xargs kill -9
echo $?