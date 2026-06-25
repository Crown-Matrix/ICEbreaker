#!/usr/bin/env bash

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
found=0

while [[ "$dir" != "/" ]]; do
    base="$(basename "$dir")"
    #if this doesnt work because of a "bad substitution" ensure the env bash is updated (4+)
    # bash --version ; which -a bash ;
    # also ensure script is being run using bash not sh, and that the shebang is present and correct
    if [[ "${base,,}" == "icebreaker" ]]; then
        cd "$dir" || exit 1
        found=1
        break
    fi
    dir="$(dirname "$dir")"
done

if [[ "$found" -ne 1 ]]; then
    echo "icebreaker directory not found"
    exit 1
fi

echo "$dir"