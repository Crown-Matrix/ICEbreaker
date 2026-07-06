#!/usr/bin/env bash

#this can also be called from package.json via "npm run main"

#this must be run from the icebreaker directory


full_path=$(pwd)
host_var=$(dig +short localhost)
pwd_dir="${PWD##*/}"
pwd_dir_lower=$(echo "$pwd_dir" | tr '[:upper:]' '[:lower:]')

if [[ ! ( "$pwd_dir_lower" == "icebreaker" || "$pwd_dir_lower" == "src" ) ]]; then
    echo "script must be run from the main directory"
    exit 1
fi

#icebreaker_path=$(./personal/shell/find_icebreaker.sh)

#init imports
source ./personal/shell/init_db.sh || exit 1
source ./personal/shell/init_env.sh || exit 1



#get env file path to pass to node script

env_file_path=".env" #relative to the icebreaker directory

#get env contents:
if [ -s ${env_file_path} ]; then #ensure its not empty, cuz if it is then it freaks out and imports a ton of random crap
    export $(grep -v '^#' ${env_file_path} | xargs)
fi

#up to user:
AUTO_KILL_PREVIOUS_PROCESS=$(printenv AUTO_KILL_PREVIOUS_PROCESS)
if [ "${AUTO_KILL_PREVIOUS_PROCESS}" == "true" ]; then
    npm run kill_main
fi


MAC_TAB=$(printenv MAC_TAB)
ADMIN_OPEN=$(printenv ADMIN_OPEN)
USE_EXEC=$(printenv MAC_TAB_USE_EXEC)
EXEC_PREFIX=""
if [ "$USE_EXEC" = "true" ]; then
    EXEC_PREFIX="exec "
fi

if [ "$(uname)" == "Darwin" ] && [ "${MAC_TAB}" == "true" ]; then
windowid=$(osascript -e "
tell application \"Terminal\"
    activate
    do script \"source ~/.zshrc; cd ${full_path} && echo && set -a && source ${env_file_path} && set +a && ${EXEC_PREFIX} node ./private/admin-js/main.cjs\"

    return id of front window
end tell
")
# the set -a ensures that the env vars are exported to the node process, and set +a disables it after sourcing the env file
if [ "${ADMIN_OPEN}" == "true" ]; then
    osascript -e "open location \"http://localhost:3000/admin-panel\" "
fi
mkdir -pv /tmp/icebreaker
echo "$windowid" > /tmp/icebreaker/admin_panel_window_id.txt
  else
  node --env-file=${env_file_path} "private/admin-js/main.cjs"
fi
result=$?

if [ "${AUTO_KILL_PREVIOUS_PROCESS}" == "true" ]; then
    echo -e "\e[38;5;208m[  Auto killed any previous processes  ] \n -------------------------------------- \n         [ Toggle this in .env ]\e[0m"
    echo -e "\n\n \e[1;32mServer Started Successfully...\e[0m"
fi