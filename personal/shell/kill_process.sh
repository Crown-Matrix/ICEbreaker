#!/usr/bin/env bash

script_input="none"

if [ -n "$1" ]; then
    script_input="$1"

elif [ ! -t 0 ]; then
    script_input=$(cat)

    if [ -z "$script_input" ]; then
        echo "empty stdin provided, exiting"
        exit 1
    fi
fi

if [ "$script_input" = "none" ]; then
    echo "no input provided, exiting"
    exit 1
fi

# kill process by port

process_var=$(lsof -ti:"$script_input")
process_var_display=${process_var//$'\n'/, }

if [ -z "$process_var" ]; then
    echo -e "\e[33mNo process found for port: $script_input\e[0m"
else
    echo -e "\e[32mKilling process for port [$script_input] with pid(s): $process_var_display\e[0m"
fi

lsof -ti:"$script_input" | xargs kill
result=$?

if [ "$(uname)" == "Darwin" ]; then
    # kill the current terminal for user convenience
    windowid=""

    if [ -f /tmp/icebreaker/admin_panel_window_id.txt ]; then
        windowid=$(tr -d '\n' < /tmp/icebreaker/admin_panel_window_id.txt)
    fi

    if [ -n "$windowid" ]; then
        closed_count=$(
            osascript -e "
                tell application \"Terminal\"
                    try
                        set matchingWindows to (every window whose id is $windowid)
                        set n to count of matchingWindows
                        close matchingWindows
                        return n
                    on error
                        return 0
                    end try
                end tell
            "
        )

        if [[ "$closed_count" -gt 0 ]]; then
            if [[ "$closed_count" -eq 1 ]]; then
                echo -e "\e[32mKilling terminal window with id: [$windowid]\e[0m"
            else
                echo -e "\e[33mKilling $closed_count terminal windows with id: [$windowid]\e[0m"
                #this shouldnt have to ever run unless i refactor the code to identify windows by something that isnt exclusive to only one window(like id)
            fi
        else
            echo -e "\e[33mNo terminal window to close for window id: [$windowid]\e[0m"
        fi
    fi

    echo "" > /tmp/icebreaker/admin_panel_window_id.txt
fi

if [ $result -eq 0 ]; then
    exit 0 # silent success, process killed
else
    echo -e "\e[1;31mFailed to kill process for port: $script_input\e[0m"
    exit 1 # failure
fi
