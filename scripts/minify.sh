#!/usr/bin/env bash

# simple script to concatenate and 'minify' js or css files
# to avoid adding a dependency on the dev toolchain

usage() {
  echo "Usage: $0 -f <files> -s <source_folder> -d <destination>"
  exit 1
}

# get source files, source folder and destination file from mandatory arguments -f and -s and -d
while getopts "f:s:d:" opt; do
  case $opt in
    f) files="$OPTARG" ;;
    s) src_folder="$OPTARG" ;;
    d) destination="$OPTARG" ;;
    *) usage ;;

  esac
done

# Check if all mandatory arguments are provided
if [ -z "$files" ] || [ -z "$src_folder" ] || [ -z "$destination" ]; then
  usage
fi

echo "'Minifying' $files ($src_folder) -> $destination"

is_css_file=false
if [[ $destination == *.css ]]; then
  is_css_file=true
fi

concatenated_content=$(for file in $files; do
  cat "$src_folder/$file"
  echo -e "\n"
done
)

# apply basic minification:

concatenated_content=$(echo "$concatenated_content" \
  | sed 's/^[ \t]*//; s/[ \t]*$//' \
  | sed '/^\/\//d' \
  | sed 's/\/\*.*\*\///g' \
  | sed ':a; /\/\*/{N; /\*\//!ba; s/\/\*.*\*\///};' \
  | sed '/^$/N;/^\n$/D' \
  | sed '/^$/d')

if [ "$is_css_file" = true ]; then
  concatenated_content=$(echo "$concatenated_content" | tr -d '\n')
  concatenated_content=$(echo "$concatenated_content" | sed 's/, /,/g')
fi

echo "$concatenated_content" > "$destination"
