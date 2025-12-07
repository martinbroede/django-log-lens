#!/usr/bin/env bash

# simple script to concatenate and 'minify' js or css files
# to avoid adding a dependency on the dev toolchain

usage() {
  echo "Usage: $0 -f <files> -d <source_folder> -o <destination>"
  exit 1
}

# get source files, source folder and destination file from mandatory arguments -f and -d and -o
while getopts "f:d:o:" opt; do
  case $opt in
    f) files="$OPTARG" ;;
    d) src_folder="$OPTARG" ;;
    o) dist="$OPTARG" ;;
    *) usage ;;

  esac
done

# Check if all mandatory arguments are provided
if [ -z "$files" ] || [ -z "$src_folder" ] || [ -z "$dist" ]; then
  usage
fi

echo "'Minifying' $files ($src_folder) -> $dist"

is_css_file=false
if [[ $dist == *.css ]]; then
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

echo "$concatenated_content" > $dist
