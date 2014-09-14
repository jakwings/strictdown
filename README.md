strictdown.js
=============

A Strictdown parser and compiler written in Javascript. Built for web browsers
and Node.js&trade;.

(Welcome to see my new design – [Kaj Markup Language](https://github.com/jakwings/Kaj-Markup-Language).)


About Strictdown
================

Strictdown is a Markdown-like markup language originally for writing simple HTML
documents which can be printed out onto a paper.

It aims to provide a better syntax for plain text writing with nice editors, and
for writing correct parsers (...vanilla Markdown sucks ;-).

It focus on readability, simplicity and consistency, and has a stricter syntax
but some extra features which the vanilla Markdown doesn't provide. So, its
syntax is different from vanilla Markdown's in many ways.

It is not only for phonograms (like English), but for logograms (like Chinese).
And I'm a Chinese. I think lots of Chinese people will find it more suitable for
their works.

Now it is finished, but it may be still unstable. You can have a look at the
[Quick Reference] first. [Full syntax] is available, too.

Live demo: http://jakwings.github.io/strictdown/demo.html

[Quick Reference]: http://jakwings.github.io/strictdown/QuickReference.html

[Full syntax]: http://jakwings.github.io/strictdown/Syntax.html

**If you have any suggestion for the syntax, please submit an issue!**


Usage
=====

Simple usage:

``` javascript
var strictdown = require('strictdown');
strictdown('I am using __Strictdown__.');
// Output: <p>I am using <i>Strictdown</i>.</p>

// Use custom options.
strictdown(source, options);
```


strictdown(source \[, options\] \[, callback\])
===============================================

source
------

Type: `string`

A string of Strictdown source to be converted.

options
-------

Type: `object`

A onetime options of the converter, represented as a dictionay. The default
options can be changed by using `strictdown.setOptions(options)`. Here are the
explanations of each option:

### silent: `false`

Set the error message as the result instead of throwing an Error object when an
error occurs.

### sanitize: `false`

Inline HTML tags will not be parsed, raw HTML blocks will be deleted if no
highlight function is specified, and the url of links and the style attributes
of images will be filtered. Every spaces in language names of code blocks will
be replaced with a dash.

### pedantic: `false`

Always use 4 spaces in the list items to make indentation, and sub-indented
elements (not nested elements!) are not allowed.

### hardtab: `false`

Every `'\t'` will be replaced by 4 spaces for pedantic mode.

### xhtml: `false`

Output correct closed tags for XHTML. The converter will not check and correct
errors for you. Please follow the XHTML guidelines on your own:
<http://www.w3.org/TR/xhtml1/#guidelines>

### stylish: `true`

Use the `style` attribute instead of the deprecated HTML4 attributes to
decorate images and tables.

### headingBase: `1`

By default, the biggest size of headings is 1. It can be set to 2 -- 6 to give
an offset of `headingBase - 1` to the size of the headings. e.g. If headingBase
is 2, `# H1 heading` will become `<h2>H1 heading</h2>`, `###### H6` will become
a special paragraph.

### wrappingMode: `'default'`

Lines in a text block using lazy syntax will be join by one space by default,
just like what browsers do to the HTML code. The converter also provide other
modes to sastify different people with different writing styles.

* `'default'`: Multiple lines will be joined by one space by default. A single
  backslash `'\\'` at the end of a line will be converted to a `<br>`.

* `'ignore'`: Multiple lines will be joined by empty string. A single backslash
  `'\\'` at the end of a line will be converted to a `<br>`.

* `'break'`: Treat every linebreak as a `<br>`.

* `'paragraph'`: Split the text into multiple paragraphs by linebreaks. If the
  text is not in a paragraph, use `<br>` instead.

### generalPrefix: `'smd-'`

It is used for decorating all the elements' ids and class names except for code
blocks.

### languagePrefix: `'lang-'`

It is used to prefix the class names of code blocks.

### baseUri: `''`

It is the base URI for generating automatic links.

### highlight: `null`

You can use custom function to highlight the code blocks or parse the raw HTML
code.

Type: `function(code, lang, raw, callback)`

Parameters:

* `code: string`: text of a code block

* `lang: string`: language name

* `raw: boolean`: whether the code block is used as raw HTML code

* `callback: function(err: Error, result: string)`: Please use it to give
  the result to the converter in asynchronous mode. Set result to null or
  the original text to tell whether the text is not already parsed.

If no callback function is set, it should return the html code for the
highlighted code, or return null or an empty string if the code is not already
parsed.

### macros:

Once you dive into the source code, you can customize the macros and do some
magic! e.g. Use `<[video URL]>` to insert an video or `<[raw <tag>]>` to insert
simple raw HTML code.

callback
--------

Type: `function(err, output)`

Parameters: `err: Error, result: string`

The function to be called when `source` is fully converted to HTML
code. If it is set, the converter will enter asynchronous highlighting mode. If
the `options` argument is omitted, it can be used as the second argument.

The first parameter will be set to an Error object if error occurs. The second
parameter is the HTML code converted from `source`.


Keep It Simple and Strict
=========================

Although Strictdown is a stricter markup language, strictdown.js is a simple but
still fast converter. I must thank [chjj](https://github.com/chjj) for his
[marked.js](https://github.com/chjj/marked), because most of the source code is
borrowed from and inspired by his.

As myself, a reStructuredText user, I like reStructuredText very much, but
reStructuredText has no lightweight parser. So I was just curious. Why there is
not a Markdown variant as powerful as reStructuredText. Finally, Strictdown was
created, though it is not as powerful as reStructuredText at all for KISS. :-)


License
=======

Copyright &copy; 2014 Jak Wings (MIT Licensed)

Please see LICENSE for more info.