/******************************************************************************\
 * Date: 2014-04-23 17:37:57 +08:00
 * Author: Jak Wings
 * License: MIT Licensed
 * Website: https://github.com/jakwings/strictdown
 * Description: strictdown, a parser for a Markdown variant -- Strictdown
 * Thanks to:
 *   https://github.com/chjj/marked
 *   https://github.com/evilstreak/markdown-js
 *   http://kramdown.gettalong.org/syntax.html
 *   https://sourceforge.net/p/forge/documentation/markdown_syntax/
\******************************************************************************/
;
(function (global) {
'use strict';


/******************************************************************************\
 * Helpers
\******************************************************************************/

var escape = function (text, alt) {
  return text.
      /**
       * Named Character References:
       * http://www.w3.org/TR/html5/syntax.html#named-character-references
       */
      replace(alt ? /&(?!#?\w+;)/g : /&/g, '&amp;').
      /** Predefined Entities in HTML4 (not including &apos;) */
      replace(/[<>"']/g, function (c) {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case '\'': return '&#39;';
          default: return c;
        }
      });
};

var quotemeta = function (str) {
  return str.replace(/([.\\+*?\^\[\]$(){}])/g, '\\$1');
};

var reTrim = /^  *|(\\ )|  *$/gm;

var reEscape = /\\([-*+_.`~^":\[\]<>(){}|@&=#\\])/g;
var reEscape2 = /\\([ \-*+_.`~^":\[\]<>(){}|@&=#\\])/g;

/**
 * merges multiple objects' properties and returns the object
 * @type {function(Object, ...[Object])}
 * @param {Object} obj which object to merge into
 * @return {Object}
 */
var merge = function (obj) {
  var target;
  for (var i = 1, l = arguments.length; i < l; i++) {
    target = arguments[i];
    for (var key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        obj[key] = target[key];
      }
    }
  }
  return obj;
};

/**
 * makes padding of specific length
 * @param {(number|string)} n
 * @return {string}
 */
var pad = function (n) {
  if (typeof n !== 'number') { n = n.length; }
  var res = '';
  var spaces = ' ';
  for (n |= 0; n > 0; n >>>= 1, spaces += spaces) {
    if (n & 1) { res += spaces; }
  }
  return res;
};

/**
 * splits one table row into special units with ^ or |
 * @param {string} str
 * @return {Array.<string>}
 */
var splitTableRow = function (str) {
  var units = [];
  var part = '';
  var i, l, c, p;
  var cellLength = 0;
  for (i = 0; c = str.charAt(i); i++) {
    if (((c === '|') || (c === '^')) && (p !== '\\')) {
      if (part) {
        units.push(part);
        part = '';
      }
      p = c;
      units.push(c);
      continue;
    }
    p = c;
    part += c;
    cellLength++;
  }
  if (part) { units.push(part); }
  units.cellLength = cellLength;
  return units;
};

/**
 * checks if the block is in specific indentation level
 * @param {RegExp} indentTest
 * @param {string} block a string that doesn't contain consecutive \n
 * @return {boolean}
 */
var isIndented = function (indentTest, block) {
  return (block.match(indentTest) || []).length === block.split('\n').length;
};

/**
 * splits the source code into blocks
 * @param {string} src Strictdown code
 * @return {Array.<string>}
 */
var split = function (src) {
  src = src.replace(/^ *\n(?: *\n)*/, '');
  /**
   * regex to match until the end of the string, or, two or more blank lines,
   * then split the text into every two parts finally.
   * [^] is equivalent to [\s\S] but doesn't work in IE 7.
   */
  //var regexBlock = /([\s\S]+?)(\n *\n(?: *\n)*|\n *$|$)/g;
  var regexBlock = /([\s\S][\s\S]*?)(\n *\n(?: *\n)*|\n *$|$)/g;
  var blocks = [];
  var matches;
  while (matches = regexBlock.exec(src)) {
    // all non-blanklines blocks are not started with \n
    blocks.push(matches[1]);
    if (matches[2]) {
      // all blanklines blocks are started with \n
      blocks.push(matches[2]);
    }
  }
  return blocks;
};


/******************************************************************************\
 * Block-Level Grammar
\******************************************************************************/

/**
 * Warning: All \r and \r\n in the source code will be replaced with \n.
 *
 * All syntactic indentation must use space character (U+0020) , not tab nor
 * non-breakable space (U+00A0) nor any other character.
 *
 * Sometimes, one line can be separated into two by a linebreak, and they will
 * be joined by a space in the output (just like HTML code!). This is called
 * "lazy syntax".
 *
 * You can view these frustrating regexen with the help from www.regexper.com
 */
var reBlock = {
  /**
   * Blanklines, a normal divider between block elements or syntactic separator
   * of one block element.
   * It is composed of one or multiple lines containing only spaces or nothing.
   */
  //blanklines: /^(?:\n *)+$/,
  //blanklines: /^\n *(?:\n *)*$/,
  blanklines: /^\n/,
  /**
   * EOB, an general end-of-block notion between block elements (especially
   * of the same type).
   */
  eob: /^\^ *$/,
  /**
   * Place some magic here. :)
   * #^
   *   <\[ ((?:\\[\s\S] | [^\\])+) \]> [ ]*
   * #$
   */
  macro: /^<\[((?:\\[\s\S]|[^\\])+)*\]> *$/,
  /**
   * Complex macro
   */
  macro_start: /^<\[([\s\S]*)/,
  macro_end: /(?:^|\n)\]> *$/,
  /**
   * Multiple code blocks separated by blanklines will be joined together.
   */
  //code: /^ {4}[^\n]+(?:\n {4}[^\n]+)*$/,
  code: /^    [^\n][^\n]*(?:\n    [^\n][^\n]*)*$/,
  /**
   * Fenced code block, is composed of any text between two "fences".
   * The first fence is three or more tildes (~), and the second fence is
   * mostly the same as the first fence but it must not have less tildes
   * than the first fence. Both fences can be followed by zero or more spaces.
   *
   * You can specify the language of the code block by appending the language
   * to the first fence. Spaces around it are stripped, except the space is
   * escaped using a backslash.
   *
   * The second fence is optional, so that if there is no second fence, the
   * rest of the source code in the same identation level is still in the code
   * block, but all the trailing \n are lost.
   *
   * #^
   *   (~{3,})         # the first fence
   *     ([^\n]*)      # optionally followed by language name
   *   (\n [^]+?)? \n  # code block
   *   \1~* [ ]*       # the second fence
   * #$
   */
  //fences: /^(~{3,})[^\n]*(\n[\s\S]+?)?\n\1~* *$/,
  //fences_start: /^(~{3,})([^\n]*)/,
  //fences_end: /(?:^|\n)(~{3,}) *$/,
  fences: /^(~~~~*)[^\n]*(\n[\s\S]+?)?\n\1~* *$/,
  fences_start: /^(~~~~*)([^\n]*)/,
  fences_end: /(?:^|\n)(~~~~*) *$/,
  /**
   * Lazy syntax is allowed.
   * #^
   *   ([^]+?) \n   # title
   *   (?:(=)+|-+)  # consecutive = or - in the same indentation level
   *     [ ]*       # then optional spaces
   * #$
   */
  //setext: /^([\s\S]+?)\n(?:(=)+|-+) *$/,
  setext: /^([\s\S]+?)\n(?:(=)=*|--*) *$/,
  /**
   * Lazy syntax is allowed.
   * #^
   *   (#{1,6})(?!#)             # leading #
   *     ((?:\\[\s\S]|[^\\])+?)  # then the title
   *       (?:#+[ ]*)?           # ended by optional #, then optional spaces
   * #$
   */
  //atx: /^(#{1,6})(?!#)((?:\\[\s\S]|[^\\])+?)(?:#+ *)?$/,
  atx: /^(##{0,5})(?!#)((?:\\[\s\S]|[^\\])+?)(?:##* *)?$/,
  /**
   * Multiple blockquote blocks separated by blanklines will be joined together.
   * #^
   *   >( *)[^\n]*           # a leading > followed by non-\n
   *     (?:\n>(?: \1[^\n]*  # continued in the same indentation level
   *             |
   *             ))*
   * #$
   */
  blockquote: /^>( *)[^\n]*(?:\n>(?:\1[^\n]*|))*$/,
  /**
   * Multiple ul blocks separated by blanklines will be joined together.
   * The compact list is matched first.
   * #^
   *   [+\-*] [ ]+  # marker
   *     [^]*       # item
   * #$
   */
  ul: /^[+\-*] /,
  /**
   * Multiple ol blocks separated by blanklines will be joined together.
   * The compact list is matched first.
   * #^
   *   \d+\. [ ]+  # marker
   *     [^]*      # item
   * #$
   */
  //ol: /^\d+\. /,
  ol: /^\d\d*\. /,
  /**
   * Multiple dl blocks separated by blanklines will be joined together.
   * The compact list is matched first.
   * #^
   *   ([^: ][^\n]*            # on term
   *     (?:\n [^: ][^\n]*)*)  # more terms?
   *   \n (: [ ] [^]*)         # definitions
   * #$
   */
  //dl: /^([^: ][^\n]*(?:\n[^: ][^\n]*)*)\n(: [\s\S]*)$/,
  dl: /^([^: ][^\n]*(?:\n[^: ][^\n]*)*)\n(: [\s\S]*)$/,
  //dd: /^:( +)[^\n]*(?:\n \1[^\n]*)*$/,
  dd: /^:(  *)[^\n]*(?:\n \1[^\n]*)*$/,
  dd_pedantic: /^:  *[^\n]*(?:\n    [^\n]*)*$/,
  /**
   * Link ID is case-insensitive.
   * ID can not start with ^, !, or *.
   * #^
   *   :\[(?![\^*@]) ([^\[\]\n\\]+) \]    # ID in square brackets
   *     : [ ]+                           # ": ", then optional spaces
   *       ([^ \n]+) [ ]*                 # URI that contains no spaces
   *       (?:\n?[ ]+                     # \n before title is allowed
   *         " ((?:\\["\\]|[^"\\\n])*) "  # optional title in double quotes
   *           [ ]*)?                     # then optional spaces
   * #$
   */
  //link: /^:\[(?![\^*@])([^\[\]\n\\]+)\]: +([^ \n]+) *(?:\n? +"((?:\\["\\]|[^"\\\n])*)" *)?$/,
  link: /^:\[(?![\^*@])([^\[\]\n\\][^\[\]\n\\]*)\]:  *([^ \n][^ \n]*) *(?:\n?  *"((?:\\["\\]|[^"\\\n])*)" *)?$/,
  // The compact link list is matched first.
  links: /^:\[(?![\^*@])[^\[\]\n\\][^\[\]\n\\]*\]: /,
  /**
   * Abbreviation ID is case-sensitive.
   * Lazy syntax is allowed.
   * #^
   *   \*\[([^\[\]\n\\]+)\]            # *, then ID in square brackets
   *     : [ ]                         # ": "
   *       ([^\n]+ (?:\n[ ] [^\n]+)*)  # full phrase of the abbreviation
   * #$
   */
  //abbr: /^\*\[([^\[\]\n\\][^\[\]\n\\]*)\]: ([^\n]+(?:\n [^\n]+)*)$/,
  abbr: /^\*\[([^\[\]\n\\][^\[\]\n\\]*)\]: ([^\n][^\n]*(?:\n [^\n][^\n]*)*)$/,
  // The compact abbr list is matched first.
  abbrs: /^\*\[[^\[\]\n\\][^\[\]\n\\]*\]: /,
  /**
   * Footnote ID is case-insensitive.
   * Complex Footnote:
   * #^
   *   \^\[([^\[\]\n\\]+)\]       # ^, then ID in square brackets
   *     : [ ]*                   # :, then optional spaces
   *     ((?:\n [ ]{4} [^\n]+)+)  # \n followed by block elements
   *                              # indented with four spaces
   * #$
   */
  //footnotex: /^\^\[([^\[\]\n\\]+)\]: *((?:\n {4}[^\n]+)+)$/,
  footnotex: /^\^\[([^\[\]\n\\][^\[\]\n\\]*)\]: *((?:\n    [^\n][^\n]*)+)$/,
  /**
   * Footnote ID is case-insensitive.
   * Lazy syntax is allowed.
   * #^
   *   \*\[([^\[\]\n\\]+)\]            # ^, then ID in square brackets
   *     : [ ]                         # ": "
   *       ([^\n]+ (?:\n[ ] [^\n]+)*)  # content
   * #$
   */
  //footnote: /^\^\[([^\[\]\n\\][^\[\]\n\\]*)\]: ([^\n]+(?:\n [^\n]+)*)$/,
  footnote: /^\^\[([^\[\]\n\\][^\[\]\n\\]*)\]: ([^\n][^\n]*(?:\n [^\n][^\n]*)*)$/,
  // The compact footnote list is matched later.
  footnotes: /^\^\[[^\[\]\n\\][^\[\]\n\\]*\]: /,
  /**
   * Image ID is case-insensitive.
   * #^
   *   @\[([^\[\]\n\\]+)\]                   # !, then ID in square brackets
   *   : [ ]+                                # ": ", then optional spaces
   *   ([^ \n]+) [ ]*                        # URI that contains no spaces
   *   (?:
   *     \n? [ ]+                            # \n before x,y:z is allowed
   *       ([^ "',:;\n\}]+,[^ "',:;\n\}]+)?  # optional image size x,y
   *       (:left|:right)?                   # optional float attribute :z
   *         [ ]*)?                          # then optional spaces
   *   (?:
   *     \n? [ ]+                            # \n before title is allowed
   *       " ((?:\\["\\]|[^"\\\n])*) "       # optional title in double quotes
   *         [ ]*)?                          # then optional spaces
   * #$
   */
  //image: /^@\[([^\[\]\n\\]+)\]: +([^ \n]+) *(?:\n? +([^ "',:;\n\}]+,[^ "',:;\n\}]+)?(:left|:right)? *)?(?:\n? +"((?:\\["\\]|[^"\\\n])*)" *)?$/,
  image: /^@\[([^\[\]\n\\][^\[\]\n\\]*)\]:  *([^ \n][^ \n]*) *(?:\n?  *([^ "',:;\n\}][^ "',:;\n\}]*,[^ "',:;\n\}][^ "',:;\n\}]*)?(:left|:right)? *)?(?:\n?  *"((?:\\["\\]|[^"\\\n])*)" *)?$/,
  // The compact footnote list is matched later.
  images: /^@\[[^\[\]\n\\][^\[\]\n\\]*\]: /,
  /**
   * <img> on the outside of <p>
   */
  //figure: /^\[((?:\\[\s\S]|[^\\\]])+?)\]@<([^ \n]+)(?: *\n? +([^ "',:;\n\}]+,[^ "',:;\n\}]+)?(:left|:right)?)?(?: *\n? +"((?:\\["\\]|[^"\\\n])*)")?> *$/,
  figure: /^\[((?:\\[\s\S]|[^\\\]])+?)\]@<([^ \n][^ \n]*)(?: *\n?  *([^ "',:;\n\}][^ "',:;\n\}]*,[^ "',:;\n\}][^ "',:;\n\}]*)?(:left|:right)?)?(?: *\n?  *"((?:\\["\\]|[^"\\\n])*)")?> *$/,
  figures: /^\[(?:\\[\s\S]|[^\\\]])+?\]@<[^ \n]/,
  /**
   * #^
   *   (?: (?:-[ ]*){3,}     # at least three -, can be separated by any space
   *     | (?:\*[ ]*){3,}    # at least three *, can be separated by any space
   *     )
   * #$
   */
  //hr: /^(?:(?:- *){3,}|(?:\* *){3,})$/,
  hr: /^(?:- *- *- *(?:- *)*|\* *\* *\* *(?:\* *)*)$/,
  /**
   * Table's syntax is a combination of DokuWiki's and PHP Markdown Extra's.
   *
   *  +--------------------------------------------+
   *  |         right|    center    |left          |
   *  |left          |         right|    center    |
   *  | xxxxxxxxxxxx | xxxxxxxxxxxx | xxxxxxxxxxxx |
   *  +--------------------------------------------+
   *
   *  +============================================+
   *  |           Table with alignment           |||
   *  |============================================|
   *  ^ Header       |    center    |left          |
   *  ^ Header       |         right|    center    |
   *  ^ Header       | xxxxxxxxxxxx | xxxxxxxxxxxx |
   *  |--------------------------------------------|
   *  | row spaning  |    center    |left          |
   *  | :::          |         right|    center    |
   *  | :::          |       col spaning          ||
   *  |============================================|
   *  |    footer    |    footer    |    footer    |
   *  +--------------------------------------------+
   *
   *  <table> always contains at least one <tbody>
   *
   *  +--------------------------------------------+
   *  +--------------------------------------------+
   *
   *  +============================================+
   *  |============================================|
   *  +--------------------------------------------+
   *
   *  +--------------------------------------------+
   *  |============================================|
   *  +--------------------------------------------+
   *
   *  +============================================+
   *  |============================================|
   *  |============================================|
   *  +--------------------------------------------+
   *
   * For simplicity (only for tables), double backslashes won't give a single
   * backslash.
   * \^ --> ^
   * \| --> |
   * \\ --> \\
   * \<others> --> \<others>
   *
   * Have a simple match first.
   * #^
   *   \|(?:=+|-+)\| [ ]*
   *   (?:\n [\^|] [^\n]+ [\^|] [ ]*)*
   *   \n \|-+\| [ ]*
   * #$
   */
  //table: /^\+(?:=+|-+)\+ *(?:\n[\^|][^\n]+[\^|] *)*\n\+-+\+ *$/,
  table: /^\+(?:==*|--*)\+ *(?:\n[\^|][^\n][^\n]*[\^|] *)*\n\+--*\+ *$/,
  //table_line: /^([\^|+])(?:(=)+|-+)([\^|+]) *$/,
  table_line: /^([\^|+])(?:(=)=*|--*)([\^|+]) *$/,
  /**
   * Paragraph, is consecutive lines except blank lines.
   */
  //paragraph: /^[^\n]+(?:\n[^\n]+)*$/,
  paragraph: /^[^\n][^\n]*(?:\n[^\n][^\n]*)*$/,
  /**
   * All blocks can be indented up to three spaces, and their following blocks
   * can be indented based on the new indentation levels.
   */
  //subindented: /^( +)[^\n]+(?:\n\1[^\n]+)*$/
  subindented: /^(  *)[^\n][^\n]*(?:\n\1[^\n][^\n]*)*$/
};

/**
 * Normal block matching rules in the predefined order.
 *
 * code > others
 * footnotex > footnotes
 * fences > setext
 * setext > atx
 * others > paragraph
 */
reBlock.normal = {
  code: [0, reBlock.code],
  eob: [1, reBlock.eob],
  fences: [2, reBlock.fences_start],
  setext: [3, reBlock.setext],
  atx: [4, reBlock.atx],
  blockquote: [5, reBlock.blockquote],
  hr: [6, reBlock.hr],
  ul: [7, reBlock.ul],
  ol: [8, reBlock.ol],
  links: [9, reBlock.links],
  images: [10, reBlock.images],
  figures: [11, reBlock.figures],
  footnotex: [12, reBlock.footnotex],
  footnotes: [13, reBlock.footnotes],
  abbrs: [14, reBlock.abbrs],
  table: [15, reBlock.table],
  dl: [16, reBlock.dl],
  macro: [17, reBlock.macro_start],
  paragraph: [18, reBlock.paragrap]
};


/******************************************************************************\
 * Block-Level Lexer
\******************************************************************************/

/**
 * @constructor
 * @type {function(new:BlockLexer, Object=)}
 */
var BlockLexer = function (opts) {
  this.options = merge({}, strictdown.defaults, opts || {});
  this.rules = reBlock.normal;
  this.tokens = [];
  this.tokens.links = {};
  this.tokens.images = {};
  this.tokens.abbrs = {};
  this.tokens.notes = {};
  this.tokens.headings = [];
  var ruleNames = [];
  for (var k in this.rules) {
    ruleNames.push([this.rules[k][0], k]);
  }
  ruleNames.sort(function (a, b) {
    return (a[0] < b[0]) ? -1 : 1;
  });
  for (var i = 0, l = ruleNames.length; i < l; i++) {
    ruleNames[i] = ruleNames[i][1];
  }
  this.ruleNames = ruleNames;
  /**
   * states
   */
  this.index = 0;
  this.noteIndex = 1;
  this.headingIndex = 1;
};

/**
 * static lex method
 * @param {string} src
 * @param {Object=} opts
 * @default undefined
 * @return {Array.<Object>} tokens
 */
BlockLexer.lex = function (src, opts) {
  var lexer = new BlockLexer(opts);
//%	  lexer.counter = {};
//%	  lexer.rules.subindent = null;
//%	  for (var k in lexer.rules) {
//%	    lexer.counter[k] = {
//%	      times: 0,
//%	      total: 0
//%	    };
//%	  }
//%	  lexer.counter.WASTE = 0;  // waste time for paragraphs
//%	  var result = lexer.lex(src);
//%	  var total = 0;
//%	  for (var k in lexer.rules) {
//%	    lexer.counter[k].avg = Math.round(lexer.counter[k].total * 1000 / (lexer.counter[k].times || 1))/1000 + 'ms';
//%	    total += lexer.counter[k].total * 1000;
//%	    lexer.counter[k].total = Math.round(lexer.counter[k].total*1000)/1000 + 'ms';
//%	  }
//%	  console.table(lexer.counter);
//%	  lexer.counter.WASTE = Math.round(lexer.counter.WASTE*1000)/1000 + 'ms';
//%	  console.log('Total parsing time: ' + (Math.round(total)/1000) + 'ms',
//%	      'Total waste time: ' + lexer.counter.WASTE);
//%	  return result;
  return lexer.lex(src);
};

/**
 * preprocesses the source code
 */
BlockLexer.prototype.lex = function (src) {
  src = src.replace(/\r\n?/g, '\n');
  if (this.options.pedantic && this.options.hardtab) {
    src = src.replace(/\t/g, '    ');
  }
  var indent = this.options.pedantic ? 0 : '';
  return this.tokenize(split(src), indent, true, true, false, false);
};

/**
 * tokenizes the source code
 * @param {Array.<string>} blocks Strictdown code blocks
 * @param {(string|number)} indent spaces/level of indentation
 * @param {boolean} top whether in top level
 * @param {boolean} old whether still using previous blocks
 * @param {boolean} limited whether in limited mode
 * @param {boolean=} sub whether in sub-indentation level
 * @default undefined
 * @return {Array.<Object>} abstract syntax tree
 */
BlockLexer.prototype.tokenize = function (blocks, indent,
                                          top, old, limited, sub) {
  var notPedanticMode = !this.options.pedantic;
  var indentLen = notPedanticMode ? indent.length : (4 * indent);
  var indentTest = new RegExp('^' + pad(indentLen) + '', 'gm');
  var reIndent = indentLen ? new RegExp('^ {1,' + indentLen + '}', 'gm') : /^$/;
  var originalTopLevelTokenIndex = this.index;
  var i;
  if (old) {
    i = this.index;
  } else {
    i = this.index = 0;
  }

  OUTER_LOOP:
  for (var l = blocks.length, block; i < l; i++) {
    block = blocks[i];
    if (reBlock.blanklines.test(block)) {
      sub = false;  // does not skip the check below for other blocks.
      continue;
    } else if (isIndented(indentTest, block)) {
      block = block.replace(reIndent, '');
      // All blocks can be indented up to three spaces, and their following
      // blocks can be indented based on the new indentation levels.
      if (notPedanticMode && !sub && /^  {0,2}(?! )/.test(block)) {
//%	var timestamp = performance.now();
        var subIndent = reBlock.subindented.exec(block);
        if (subIndent && (subIndent[1].length < 4)) {
          this.index = i;
          this.tokenize(blocks, indent + subIndent[1], top, true, limited, true);
          i = this.index - 1;  // for OUTER_LOOP continuation;
//%	this.counter.subindent.total += performance.now() - timestamp;
//%	this.counter.subindent.times++;
          continue;
        }
        sub = false;  // does not skip the check above for other blocks.
//%	this.counter.subindent.total += performance.now() - timestamp;
//%	this.counter.subindent.times++;
      }
    } else {
      break OUTER_LOOP;
    }
    for (var rIdx = 0, k; k = this.ruleNames[rIdx]; rIdx++) {
//%	var timestamp = performance.now();
      var rule = this.rules[k][1];
      var matches = null;
      RULE_SWITCH:
      switch (k) {

        case 'eob':
          if (rule.test(block)) {
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'macro':
          if (matches = rule.exec(block)) {
            var text = matches[1] || '';
            var name;
            var param;
            if (!(matches = reBlock.macro.exec(block))) {
              name = (text.match(/^[^ \n][^ \n]*/) || [''])[0];
              param = text.substr(name.length).replace(/^\n\n*/, '');
              while ((++i) < l) {
                matches = null;
                block = blocks[i] || '';
                while ((i < l) && reBlock.blanklines.test(block)) {
                  param += block.replace(reIndent, '');
                  block = blocks[++i] || '';
                }
                if (!isIndented(indentTest, block)) {
                  param = param.replace(/\n\n*$/, '');
                  i--;  // for OUTER_LOOP continuation
                  break;
                }
                block = block.replace(reIndent, '');
                if (reBlock.macro_end.test(block)) {
                  param += block.replace(reBlock.macro_end, '');
                  break;
                }
                param += block;
              }
            } else {
              text = matches[1] || '';
              name = (text.match(/^[^ \n][^ \n]*/) || [''])[0];
              param = text.substr(name.length).replace(/^\n\n*/, '');
            }
            var macro = this.options.macros[name];
            if (macro) {
              var macroToken = macro.call(strictdown, this, {
                type: 'macro',
                name: name,
                text: param
              });
              this.tokens.push(macroToken);
            }  // else: ignores matched text, because this syntax is reserved.
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'code':
          if (rule.test(block)) {
            var text = block.replace(/^    /gm, '');
            while ((++i) < l) {
              block = blocks[i] || '';
              while ((i < l) && reBlock.blanklines.test(block)) {
                text += block.
                    replace(reIndent, '').
                    replace(/^  {0,3}/gm, '');
                block = blocks[++i] || '';
              }
              block = block.replace(reIndent, '');
              if (rule.test(block)) {
                text += block.replace(/^    /gm, '');
              } else {
                text = text.replace(/\n\n*$/, '');
                i--;  // for OUTER_LOOP continuation
                break;
              }
            }
            this.tokens.push({
              type: 'code',
              text: text,
              lang: ''
            });
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'fences':
          if (matches = rule.exec(block)) {
            /**
             * A single newline may be placed immediately after the start tag of
             * pre and textarea elements. If the element's contents are intended
             * to start with a newline, two consecutive newlines thus need to be
             * included by the author.
             * http://www.w3.org/TR/html5/syntax.html#element-restrictions
             *
             * It seems that a single newline placed immediately before the end
             * tags will be removed, too. But since blanklines blocks without
             * spaces all consist of two \n, we don't need to do anything
             * special here.
             */
            var tilde = matches[1];
            var lang = (matches[2] || '').replace(/^  *|  *$/g, '');
            var langMarkLen = lang.match(/^(\**)/)[1].length;
            var text = block.
                replace(reBlock.fences_start, '').
                replace(/^\n/, '');
            if (matches = reBlock.fences.exec(block)) {
              text = (matches[2] || '').substr(1);
            } else {
              while ((++i) < l) {
                block = blocks[i] || '';
                while ((i < l) && reBlock.blanklines.test(block)) {
                  text += block.replace(reIndent, '');
                  block = blocks[++i] || '';
                }
                if (!isIndented(indentTest, block)) {
                  text = text.replace(/\n\n*$/, '');
                  i--;  // for OUTER_LOOP continuation
                  break;
                }
                block = block.replace(reIndent, '');
                if ((matches = reBlock.fences_end.exec(block)) &&
                    (matches[1].length >= tilde.length)) {
                  text += block.replace(reBlock.fences_end, '');
                  break;
                }
                text += block;
              }
            }
            this.tokens.push({
              type: 'code',
              lang: lang.substr(langMarkLen),
              text: text,
              raw: langMarkLen > 0,
              mix: langMarkLen > 1
            });
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'setext':
          if (matches = rule.exec(block)) {
            var text = matches[1].replace(reTrim, '$1');
            this.tokens.push({
              type: 'heading',
              text: text,
              size: matches[2] ? 1 : 2
            });
            if (top) {
              this.tokens.headings.push({
                size: matches[2] ? 1 : 2,
                text: text,
                index: this.headingIndex++
              });
            }
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'atx':
          if (matches = rule.exec(block)) {
            var text = matches[2].replace(reTrim, '$1');
            if (!text || (text === '\n')) {
              break;
            }
            this.tokens.push({
              type: 'heading',
              text: text,
              size: matches[1].length
            });
            if (top) {
              this.tokens.headings.push({
                size: matches[1].length,
                text: text,
                index: this.headingIndex++
              });
            }
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'blockquote':
          if (matches = rule.exec(block)) {
            this.tokens.push({type: 'quote_start'});
            do {
              var text = block.replace(
                  new RegExp('^>(?:' + matches[1] + ')?', 'gm'), '');
              this.tokenize(split(text), notPedanticMode ? '' : 0, false, false,
                  limited);
              // find the next part of the blockquote
              block = (blocks[++i] || '');
              while ((i < l) && reBlock.blanklines.test(block)) {
                block = (blocks[++i] || '');
              }
              if (!isIndented(indentTest, block) ||
                  !(matches = rule.exec(block = block.replace(reIndent, '')))) {
                i--;  // for OUTER_LOOP continuation
                break;
              }
            } while (i < l);
            this.tokens.push({type: 'quote_end'});
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'ul':
          var isUnorderedList = true;
        case 'ol':
          var isUnorderedList = isUnorderedList || false;
          if (rule.test(block)) {
            // All the tightly following text after the bullet marker are
            // treated as plain text or paragraph despite their indentation.
            var isList = true;
            var loopCount = 0;
            var startIndex = this.tokens.push({
              type: isUnorderedList ? 'ul_start' : 'ol_start'
            }) - 1;
            ITEM_TOKEN_LOOP:
            while (true) {
              var items;
              if (isUnorderedList) {
                items = block.split(/\n(?=[+\-*] )/);
              } else {
                items = block.split(/\n(?=\d\d*\. )/);
              }
              // deals with all the simple items first
              for (var ii = 0, ll = items.length - 1; ii < ll; ii++) {
                var space = pad(notPedanticMode ?
                    items[ii].match(/^[^ ]+  */)[0] : (indentLen + 4));
                var strictRule = new RegExp(
                    '^[^\\n]+(?:\\n' + space + '[^\\n][^\\n]*)*$');
                if (!strictRule.test(items[ii])) {
                  if (loopCount === 0) {
                    isList = false;
                    this.tokens.splice(startIndex);
                  } else {
                    i--;  // for OUTER_LOOP continuation
                  }
                  items = null;
                  break ITEM_TOKEN_LOOP;
                }
                this.tokens.push({
                  type: 'li',
                  text: items[ii].
                      replace(/^[^ ]+ +\n?/, '').
                      replace(reTrim, '$1')
                });
              }
              // deals with the last item
              var text = items.pop();
              var space = pad(notPedanticMode ?
                  text.match(/^[^ ]+/)[0] : (indentLen + 4));
              var strictRule = new RegExp(notPedanticMode ?
                  ('^[^ ]+( +)[^\\n]*(?:\\n' + space + '\\1[^\\n][^\\n]*)*$') :
                  ('^[^\\n]+(?:\\n' + space + '[^\\n][^\\n]*)*$'));
              if (!(matches = strictRule.exec(text))) {
                if (loopCount === 0) {
                  isList = false;
                  this.tokens.splice(startIndex);
                } else {
                  i--;  // for OUTER_LOOP continuation
                }
                items = null;
                break ITEM_TOKEN_LOOP;
              }
              var temp = this.tokens.push({type: 'li_start'});
              this.tokens.push({
                type: 'text',
                text: text.
                    replace(/^[^ ]+ +\n?/, '').
                    replace(reTrim, '$1')
              });
              this.index = i + 1;
              if (notPedanticMode) {
                this.tokenize(blocks, indent + space + matches[1], top, true,
                    limited);
              } else {
                this.tokenize(blocks, indent + 1, top, true, limited);
              }
              if (!this.tokens[startIndex].complex) {
                // checks if it is not a simple list
                if (this.tokens.length - temp > 1) {
                  this.tokens[startIndex].complex = true;
                } else if (this.tokens.length - temp === 1) {
                  if (this.tokens[temp].type !== 'text') {
                    this.tokens[startIndex].complex = true;
                  }
                }
              }
              this.tokens.push({type: 'li_end'});
              // finds the next items
              i = this.index;
              block = blocks[i] || '';
              while ((i < l) && reBlock.blanklines.test(block)) {
                block = blocks[++i] || '';
              }
              if (!isIndented(indentTest, block) ||
                  !rule.test(block = block.replace(reIndent, ''))) {
                i--;  // for OUTER_LOOP continuation
                break;
              }
              loopCount++;
            }
            if (isList) {
              if (isUnorderedList) {
                this.tokens.push({type: 'ul_end'});
              } else {
                this.tokens.push({type: 'ol_end'});
              }
              isUnorderedList = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
              continue OUTER_LOOP;
            }
          }
          isUnorderedList = null;
          break;

        case 'dl':
          if (matches = rule.exec(block)) {
            // All the tightly following text after the definition marker are
            // treated as plain text or paragraph despite their indentation.
            var isList = true;
            var loopCount = 0;
            var startIndex = this.tokens.push({type: 'dl_start'}) - 1;
            DEFINITION_TOKEN_LOOP:
            do {
              var terms = matches[1].
                  replace(reTrim, '$1').
                  split('\n');
              for (var ii = 0, ll = terms.length; ii < ll; ii++) {
                this.tokens.push({
                  type: 'dt',
                  text: terms[ii]
                });
              }
              while (true) {
                // "matches" for reBlock.dl, "block" for reBlock.dd
                var definitions = ((matches && matches[2]) || block).
                    split(/\n(?=: )/);
                // deals with all the simple definitions first
                var strictRule = notPedanticMode ? reBlock.dd : reBlock.dd_pedantic;
                for (var ii = 0, ll = definitions.length - 1; ii < ll; ii++) {
                  if (!strictRule.test(definitions[ii])) {
                    if (loopCount === 0) {
                      isList = false;
                      this.tokens.splice(startIndex);
                    } else {
                      i--;  // for OUTER_LOOP continuation
                    }
                    definitions = null;
                    break DEFINITION_TOKEN_LOOP;
                  }
                  this.tokens.push({
                    type: 'dd',
                    text: definitions[ii].
                        replace(/^: +\n?/, '').
                        replace(reTrim, '$1')
                  });
                }
                // deals with the last definition
                var temp = this.tokens.push({type: 'dd_start'});
                var text = definitions.pop();
                if (!(matches = strictRule.exec(text))) {
                  if (loopCount === 0) {
                    isList = false;
                    this.tokens.splice(startIndex);
                  } else {
                    i--;  // for OUTER_LOOP continuation
                  }
                  definitions = null;
                  break DEFINITION_TOKEN_LOOP;
                }
                this.tokens.push({
                  type: 'text',
                  text: text.
                      replace(/^: +\n?/, '').
                      replace(reTrim, '$1')
                });
                this.index = i + 1;
                if (notPedanticMode) {
                  this.tokenize(blocks, indent + ' ' + matches[1], top, true,
                      limited);
                } else {
                  this.tokenize(blocks, indent + 1, top, true, limited);
                }
                if (!this.tokens[startIndex].complex) {
                  // checks if it is not a simple list
                  if (this.tokens.length - temp > 1) {
                    this.tokens[startIndex].complex = true;
                  } else if (this.tokens.length - temp === 1) {
                    if (this.tokens[temp].type !== 'text') {
                      this.tokens[startIndex].complex = true;
                    }
                  }
                }
                this.tokens.push({type: 'dd_end'});
                // finds the next definitions
                i = this.index;
                block = blocks[i] || '';
                while ((i < l) && reBlock.blanklines.test(block)) {
                  block = blocks[++i] || '';
                }
                if (!isIndented(indentTest, block) ||
                    !reBlock.dd.test(block = block.replace(reIndent, ''))) {
                  break;
                }
                matches = null;
              }
              // finds the next terms and definitions
              block = blocks[i] || '';
              while ((i < l) && reBlock.blanklines.test(block)) {
                block = blocks[++i] || '';
              }
              if (!isIndented(indentTest, block) ||
                  !(matches = rule.exec(block = block.replace(reIndent, '')))) {
                i--;  // for OUTER_LOOP continuation
                break;
              }
              loopCount++;
            } while (true);
            if (isList) {
              this.tokens.push({type: 'dl_end'});
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
              continue OUTER_LOOP;
            }
          }
          break;

        case 'links':
          if (rule.test(block)) {
            var links = block.split(/\n(?=:)/);
            var sets = {};
            for (var ii = 0, ll = links.length; ii < ll; ii++) {
              if (matches = reBlock.link.exec(links[ii])) {
                var id = matches[1].toLowerCase();
                sets[id] = {
                  href: matches[2],
                  title: (matches[3] || '').replace(/\\(["\\])/g, '$1')
                };
              } else {
                sets = null;
                links = null;
                break RULE_SWITCH;
              }
            }
            merge(this.tokens.links, sets);
            links = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'images':
          if (rule.test(block)) {
            var size = null;
            var images = block.split(/\n(?=@)/);
            var sets = {};
            for (var ii = 0, ll = images.length; ii < ll; ii++) {
              if (matches = reBlock.image.exec(images[ii])) {
                var id = matches[1].toLowerCase();
                size = (matches[3] || '').split(',');
                sets[id] = {
                  href: matches[2],
                  title: (matches[5] || '').replace(/\\(["\\])/g, '$1'),
                  width: size[0] || '',
                  height: size[1] || '',
                  align: (matches[4] || '').substr(1)
                };
              } else {
                size = null;
                sets = null;
                links = null;
                break RULE_SWITCH;
              }
            }
            merge(this.tokens.images, sets);
            size = null;
            links = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'figures':
          if (rule.test(block)) {
            var size = null;
            var figures = block.split(/\n(?=\[)/);
            var startIndex = this.tokens.length;
            for (var ii = 0, ll = figures.length; ii < ll; ii++) {
              if (matches = reBlock.figure.exec(figures[ii])) {
                size = (matches[3] || '').split(',');
                this.tokens.push({
                  type: 'figure',
                  text: matches[1].replace(reTrim, '$1'),
                  href: matches[2],
                  title: (matches[5] || '').replace(/\\(["\\])/g, '$1'),
                  width: size[0] || '',
                  height: size[1] || '',
                  align: (matches[4] || '').substr(1)
                });
              } else {
                this.tokens.splice(startIndex);
                size = null;
                figures = null;
                break RULE_SWITCH;
              }
            }
            size = null;
            figures = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'footnotex':
          if (!limited && (matches = rule.exec(block))) {
            var id = matches[1].toLowerCase();
            this.tokens.notes[id] = {
              index: this.noteIndex,
              text: '',
              escaped: true,
              refs: []
            };
            this.tokens.push({
              type: 'note_start',
              name: id,
              index: this.noteIndex++
            });
            blocks[i] = matches[2].substr(1);
            this.index = i;
            if (notPedanticMode) {
              this.tokenize(blocks, indent + '    ', top, true, true);
            } else {
              this.tokenize(blocks, indent + 1, top, true, true);
            }
            i = this.index - 1;  // for OUTER_LOOP continuation
            this.tokens.push({type: 'note_end'});
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'footnotes':
          if (!limited && rule.test(block)) {
            var notes = block.split(/\n(?=\^)/);
            var sets = {};
            for (var ii = 0, ll = notes.length; ii < ll; ii++) {
              if (matches = reBlock.footnote.exec(notes[ii])) {
                var id = matches[1].toLowerCase();
                sets[id] = {
                  index: this.noteIndex++,
                  text: matches[2].replace(reTrim, '$1'),
                  escaped: false,
                  refs: []
                };
              } else {
                sets = null;
                notes = null;
                break RULE_SWITCH;
              }
            }
            merge(this.tokens.notes, sets);
            sets = null;
            notes = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'abbrs':
          if (rule.test(block)) {
            var abbrs = block.split(/\n(?=\*)/);
            var sets = {};
            for (var ii = 0, ll = abbrs.length; ii < ll; ii++) {
              if (matches = reBlock.abbr.exec(abbrs[ii])) {
                var id = matches[1];
                sets[id] = matches[2].replace(reTrim, '$1');
              } else {
                sets = null;
                abbrs = null;
                break RULE_SWITCH;
              }
            }
            merge(this.tokens.abbrs, sets);
            abbrs = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'hr':
          if (rule.test(block)) {
            this.tokens.push({type: 'hr'});
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'table':
          if (rule.test(block)) {
            var startIndex = this.tokens.push({type: 'table_start'}) - 1;
            var rows = block.split('\n');
            var isInThead = false;
            var isInTbody = false;
            var isInTfoot = false;
            var lastRowTokensIndex = null;
            for (var ii = 0, ll = rows.length - 1; ii <= ll; ii++) {
              if (matches = reBlock.table_line.exec(rows[ii])) {
                if ((ii !== 0) && (ii !== ll) &&
                    ((matches[1] !== '|') || (matches[3] !== '|'))) {
                  this.tokens.splice(startIndex);
                  rows = null;
                  lastRowTokensIndex = null;
                  break RULE_SWITCH;
                }
                // deals with <thead>
                if (ii === 0) {
                  if (matches[2]) {
                    isInThead = true;
                    this.tokens.push({type: 'thead_start'});
                  } else {
                    isInTbody = true;
                    this.tokens.push({type: 'tbody_start'});
                  }
                } else if (isInThead) {
                  if (matches[2]) {
                    isInThead = false;
                    this.tokens.push({type: 'thead_end'});
                    isInTbody = true;
                    this.tokens.push({type: 'tbody_start'});
                  } else {
                    this.tokens.splice(startIndex);
                    rows = null;
                    lastRowTokensIndex = null;
                    break RULE_SWITCH;
                  }
                // deals with <tfoot>
                } else if (!isInTfoot && matches[2]) {
                  if (isInTbody) {
                    isInTbody = false;
                    this.tokens.push({type: 'tbody_end'});
                  }
                  isInTfoot = true;
                  this.tokens.push({type: 'tfoot_start'});
                } else if (isInTfoot) {
                  if ((ii < ll) || matches[2]) {
                    this.tokens.splice(startIndex);
                    rows = null;
                    lastRowTokensIndex = null;
                    break RULE_SWITCH;
                  } else {
                    this.tokens.push({type: 'tfoot_end'});
                  }
                // deals with <tbody>
                } else {
                  if (isInTbody) {
                    isInTbody = false;
                    this.tokens.push({type: 'tbody_end'});
                  } else {
                    isInTbody = true;
                    this.tokens.push({type: 'tbody_start'});
                  }
                }
              // deal with <tr>, <th>, <td>
              } else {
                if (!isInTbody && !isInThead && !isInTfoot) {
                  isInTbody = true;
                  this.tokens.push({type: 'tbody_start'});
                }
                var row = rows[ii].replace(/[^ ] *$/g, '');
                if (row.charAt(row.length - 1) === '\\') {
                  this.tokens.splice(startIndex);
                  rows = null;
                  lastRowTokensIndex = null;
                  break RULE_SWITCH;
                }
                var units = splitTableRow(row);
                this.tokens.push({type: 'tr_start'});
                lastRowTokensIndex = lastRowTokensIndex ||
                    new Array(units.cellLength);
                var rowTokensIndex = new Array(units.cellLength);
                var lastCellIndex = null;
                var tempToken = null;
                var colNum = 0;
                for (var iii = 0, lll = units.length - 1; iii <= lll; iii++) {
                  if (/^[\^|]?$/.test(units[iii+1] || '')) {
                    if (lastCellIndex) {
                      this.tokens[lastCellIndex].colspan++;
                    }
                  } else if (iii < lll) {
                    var cell = units[iii+1];
                    if (!/^ *::: *$/.test(cell)) {
                      lastCellIndex = this.tokens.push({
                        type: (units[iii] === '|') ? 'td' : 'th',
                        text: cell.
                            replace(reTrim, '$1').
                            replace(/\\([\^|])/g, '$1'),
                        align: /^  /.test(cell) ?
                            (/  $/.test(cell) ? 'center' : 'right') : 'left',
                        colspan: 1,
                        rowspan: 1
                      }) - 1;
                      rowTokensIndex[colNum] = lastCellIndex;
                    } else {
                      tempToken = this.tokens[lastRowTokensIndex[colNum]];
                      if (tempToken) {
                        tempToken.rowspan++;
                        rowTokensIndex[colNum] = lastRowTokensIndex[colNum];
                        cell = null;
                      } else {
                        lastCellIndex = this.tokens.push({
                          type: (units[iii] === '|') ? 'td' : 'th',
                          text: cell.replace(reTrim, '$1'),
                          align: /^  /.test(cell) ?
                              (/  $/.test(cell) ? 'center' : 'right') : 'left',
                          colspan: 1,
                          rowspan: 1
                        }) - 1;
                        rowTokensIndex[colNum] = lastCellIndex;
                      }
                      tempToken = null;
                    }
                    iii++;
                  }
                  colNum++;
                }
                this.tokens.push({type: 'tr_end'});
                lastRowTokensIndex = rowTokensIndex;
                rowTokensIndex = null;
              }
            }
            this.tokens.push({type: 'table_end'});
            rows = null;
            lastRowTokensIndex = null;
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          }
          break;

        case 'paragraph':
          //if (rule.test(block)) {
            this.tokens.push({
              type: 'p',
              text: block.replace(reTrim, '$1')
            });
//%	this.counter[k].total += performance.now() - timestamp;
//%	this.counter[k].times++;
            continue OUTER_LOOP;
          //}
          break;

        default:
          throw new Error('Rule "' + k + '" does not have a handler.');
          break;
      }
//%	this.counter.WASTE += performance.now() - timestamp;
    }
    throw new Error('Infinite loop on block' + i + ': <[' + block + ']>');
  }
  if (old) {
    this.index = i;
  } else {
    this.index = originalTopLevelTokenIndex;
  }
  return this.tokens;
};


/******************************************************************************\
 * Inline-Level Grammar
\******************************************************************************/

var reInline = {
  escape: /^\\([\s\S]?)/,
  verbatim: /^(``*)((?:\\`|[\s\S])+?)(\1`*)(?:\((?! )((?:\\[\s\S]|[^\\])+?)( *)\))?/,
  strong: /^(\*\*\**)(?! )((?:\\[\s\S]|[^\\])+?)( *)(\*\*\**)/,
  em: /^(___*)(?! )((?:\\[\s\S]|[^\\])+?)( *)(___*)/,
  del: /^(~~~*)(?! )((?:\\[\s\S]|[^\\])+?)( *)(~~~*)/,
  ref: /^\|(?! )((?:\\[\s\S]|[^\\])+?)( *)\|/,
  anchor: /^\{(?! )((?:\\[\s\S]|[^\\])+?)( *)\}/,
  autolink: /^\[\[(?! )((?:\\[\s\S]|[^\\])+?)( *)\]\]/,
  image: /^\[(?! )((?:\\[\s\S]|[^\\])*?)( *)\]@(?:\[(?! )((?:\\[\s\S]|[^\\])*?)( *)\]|\((?! )((?:\\[\s\S]|[^\\])*?)( *)\))/,
  /**
   * #^
   *   \[(?![ ]) ((?:\\[\s\S]|[^\\])+?) ([ ]*)\]           # $1: [text]
   *     (?: :\[(?![ ]) ((?:\\[\s\S]|[^\\])*?) ([ ]*)\]    # $3: :[reference ID]
   *       | :\((?![ ]) ((?:\\[\s\S]|[^\\])*?) ([ ]*)\)    # $5: :(uri)
   *       )?
   * #
   */
  link: /^\[(?! )((?:\\[\s\S]|[^\\])+?)( *)\](?::\[(?! )((?:\\[\s\S]|[^\\])*?)( *)\]|:\((?! )((?:\\[\s\S]|[^\\])*?)( *)\))?/,
  footnote: /^\^\[(?! )((?:\\[\s\S]|[^\\])+?)( *)\]/,
  comment: /^<!--[\s\S]*?-->/,
  /**
   * For simplicity, strictdown.js will not check whether end tags should
   * appear, since some elements don't require end tags in HTML4 nor HTML5.
   * Neither will it prevent using block elements inside paragraphs nor
   * elsewhere.
   *
   * http://www.w3.org/TR/html5/syntax.html#optional-tags
   * http://www.w3.org/TR/html401/intro/sgmltut.html#h-3.3.3
   */
  tag: /^<\/?\w+(?:"[^"]*"|'[^']'| *[^"'>])*>/
};

/**
 * Precedence:
 * escape > others
 * autolink > image
 * image > link
 */
reInline.normal = {
  escape: [0, reInline.escape],
  verbatim: [1, reInline.verbatim],
  strong: [2, reInline.strong],
  em: [3, reInline.em],
  del: [4, reInline.del],
  ref: [5, reInline.ref],
  anchor: [6, reInline.anchor],
  autolink: [7, reInline.autolink],
  image: [8, reInline.image],
  link: [9, reInline.link],
  footnote: [10, reInline.footnote],
  comment: [11, reInline.comment],
  tag: [12, reInline.tag]
};


/******************************************************************************\
 * Inline-Level Lexer
\******************************************************************************/


/**
 * @constructor
 * @type {function(new:InlineLexer, Object, Object=)}
 */
var InlineLexer = function (info, opts) {
  this.options = merge({}, strictdown.defaults, opts || {});
  this.options.generalPrefix = escape(this.options.generalPrefix);
  this.options.languagePrefix = escape(this.options.languagePrefix);
  this.rules = reInline.normal;
  if (this.options.sanitize) {
    delete this.rules.tag;
    delete this.rules.comment;
  }
  this.links = info.links || {};
  this.images = info.images || {};
  this.abbrs = info.abbrs || {};
  this.notes = info.notes || {};
  this.headings = info.headings || [];
  var ruleNames = [];
  for (var k in this.rules) {
    ruleNames.push([this.rules[k][0], k]);
  }
  ruleNames.sort(function (a, b) {
    return (a[0] < b[0]) ? -1 : 1;
  });
  for (var i = 0, l = ruleNames.length; i < l; i++) {
    ruleNames[i] = ruleNames[i][1];
  }
  this.ruleNames = ruleNames;
  /**
   * states
   */
  this.refIndex = 0;
};

/**
 * static lex method
 * @param {string} src
 * @param {Object} info
 * @param {Object=} opts
 * @default undefined
 * @param {boolean=} notInParagraph
 * @default undefined
 * @return {string}
 */
InlineLexer.translate = function (src, info, opts, notInParagraph) {
  var lexer = new InlineLexer(info, opts);
  return lexer.translate(src, !notInParagraph);
};

/**
 * tokenizes inline text and parse it into HTML text
 * @param {string} src
 * @param {boolean=} inParagraph
 * @default undefined
 * @param {boolean=} alt alternative mode for getting plain text
 * @default undefined
 * @return {string}
 */
InlineLexer.prototype.translate = function (src, inParagraph, alt) {
  var opts = this.options;
  var res = '';
  var chunk = '';  // uses it to prevent double escaping
  OUTER_LOOP:
  while (src) {
    for (var i = 0, k; k = this.ruleNames[i]; i++) {
      var rule = this.rules[k][1];
      var matches = null;
      switch (k) {

        case 'escape':
          if (matches = rule.exec(src)) {
            src = src.substr(2);
            if (alt) {
              if (!matches[1]) { matches[0] += '\n'; }
              chunk += matches[0].replace(reEscape2, '$1');
              continue OUTER_LOOP;
            }
            if (matches[1] === ' ') {
              chunk += '&nbsp;';
            } else if (matches[1] === '\n' || !matches[1]) {
              chunk += '\\\n';
            } else {
              chunk += escape(matches[0].replace(reEscape, '$1'));
            }
            continue OUTER_LOOP;
          }
          break;

        /**
         * Something about <b>, <i>, <strong>, and <em>.
         * http://accessibility.psu.edu/boldface
         */
        case 'strong':
        case 'em':
        case 'del':
          if (matches = rule.exec(src)) {
            if (matches[3] ||
                (matches[1].length > 2) ||
                (matches[1].length !== matches[4].length)) {
              break;
            }
            src = src.substr(matches[0].length);
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              chunk += this.translate(matches[2], null, true);
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            if (k === 'strong') {
              chunk += '<b>' + this.translate(matches[2]) + '</b>';
            } else if (k === 'em') {
              chunk += '<i>' + this.translate(matches[2]) + '</i>';
            } else {
              chunk += '<del>' + this.translate(matches[2]) + '</del>';
            }
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'verbatim':
          if (matches = rule.exec(src)) {
            var isVerbatim = true;
            matches[4] = matches[4] || '';
            matches[5] = matches[5] || '';
            /**
             * Consecutive backticks (`) ?
             * No matched marks for code?
             * Trailing spaces after language name?
             */
            if (!matches[2] ||
                (matches[2] === '`') ||
                ((matches[1].length > 1) &&
                    ((matches[3].length < 2) || matches[5]))) {
              isVerbatim = false;
            } else if (matches[1].length === 1) {
              if ((matches[3].length !== 1) ||
                  !/^(?:\\[`\\]|[^`\\])+$/.test(matches[2])) {
                isVerbatim = false;
              }
            }
            if (!isVerbatim) {
              break;
            }
            if (matches[1].length !== 1) {
              src = src.substr(matches[0].length);
            } else {
              src = src.substr(matches[1].length + matches[2].length +
                  matches[3].length);
            }
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              if (matches[1].length === 1) {
                chunk += this.wrap(matches[2].replace(/\\([\\`])/g, '$1'), null,
                    true);
              } else {
                chunk += this.wrap(matches[2], null, true);
              }
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            var text;
            if (matches[1].length === 1) {
              text = matches[2].replace(/\\([\\`])/g, '$1');
              chunk += '<span class="' + opts.generalPrefix + 'literal">' +
                  this.wrap(this.abbr(escape(text))) + '</span>';
            } else {
              var lang = '';
              if (matches[4]) {
                lang = matches[4].replace(reEscape2, '$1');
                if (opts.sanitize) {
                  lang = lang.replace(/  */g, '-');
                }
                lang = ' class="' + opts.languagePrefix + escape(lang) + '"';
              }
              text = matches[2] + matches[3].slice(0, 0 - matches[1].length);
              chunk += '<code' + lang + '>' +
                  this.wrap(this.abbr(escape(text))) + '</code>';
            }
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'link':
          if (matches = rule.exec(src)) {
            if (matches[2] || matches[4] || matches[6]) {
              break;
            }
            src = src.substr(matches[0].length);
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              chunk += this.translate(matches[1], null, true);
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            var text = matches[1];
            var id = (matches[3] || '').replace(reEscape2, '$1');
            var uri = (matches[5] || '').replace(reEscape2, '$1');
            var title = '';
            if (uri) {
              uri = escape(this.shapeUri(this.wrap(uri, null, true)));
            } else {
              id = this.wrap(id, null, true);
              switch (id.charAt(0)) {
                case '^':
                  id = id.substr(1).toLowerCase();
                  if (this.notes[id]) {
                    uri = '#' + opts.generalPrefix + 'footnote-' +
                        this.notes[id].index;
                  }
                  break;
                case '@':
                  id = id.substr(1).toLowerCase();
                  if (this.images[id]) {
                    uri = escape(this.shapeUri(this.images[id].href));
                    title = escape(this.images[id].title);
                  }
                  break;
                case '*':
                  id = id.substr(1).toLowerCase();
                  uri = '#' + opts.generalPrefix + 'anchor-' + escape(id);
                  title = escape(id);
                  break;
                default:
                  id = (id || this.translate(text, null, true)).toLowerCase();
                  if (this.links[id]) {
                    uri = escape(this.shapeUri(this.links[id].href));
                    title = escape(this.links[id].title);
                  }
                  break;
              }
            }
            chunk += '<a class="' + opts.generalPrefix + 'ref-link"' +
                (uri ? (' href="' + uri + '"') : '') +
                (title ? (' title="' + title + '"') : '') +
                '>' + this.translate(text) + '</a>';
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'autolink':
          if (matches = rule.exec(src)) {
            if (matches[2]) {
              break;
            }
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              var text = this.wrap(matches[1].replace(reEscape2, '$1'), null, true);
              if (/^[@:^]/.test(text)) {
                chunk += text.substr(1);
              } else {
                chunk += text;
              }
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            src = src.substr(matches[0].length);
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            var id = this.wrap(matches[1].replace(reEscape2, '$1'), null, true);
            var uri = '';
            var title = '';
            var type = '';
            switch (id.charAt(0)) {
              case '@':
                type = 'raw';
                id = id.substr(1).toLowerCase();
                if (this.images[id]) {
                  uri = escape(this.shapeUri(this.images[id].href, true));
                  title = escape(this.images[id].title);
                  id = uri;
                }
                break;
              case ':':
                type = 'raw';
                id = id.substr(1).toLowerCase();
                if (this.links[id]) {
                  uri = escape(this.shapeUri(this.links[id].href, true));
                  title = escape(this.links[id].title);
                  id = uri;
                }
                break;
              case '^':
                type = 'ref';
                id = id.substr(1);
                if (this.notes[id.toLowerCase()]) {
                  uri = '#' + opts.generalPrefix + 'footnote-' +
                      this.notes[id.toLowerCase()].index;
                  id = escape(id);
                }
                break;
              default:
                if (!/^[^ \n][^ \n]*@[^ \/\n][^ \/\n]*$/.test(id) ||
                    /^[A-Za-z][+\-.0-9A-Za-z]*:/.test(id)) {
                  type = 'raw';
                  uri = escape(this.shapeUri(id, true));
                  id = uri;
                } else {
                  type = 'mail';
                  id = id.replace(/./g, function (m) {
                    return '&#' + m.charCodeAt(0) + ';';
                  });
                  uri = 'mailto:' + id;
                }
                break;
            }
            chunk += '<a class="' + opts.generalPrefix + type + '-link"' +
                (uri ? (' href="' + uri + '"') : '') +
                (title ? (' title="' + title + '"') : '') +
                '>' + id + '</a>';
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'footnote':
          if (matches = rule.exec(src)) {
            if (matches[2]) {
              break;
            }
            src = src.substr(matches[0].length);
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            var id = this.wrap(matches[1].replace(reEscape2, '$1'), null, true);
            var index = 0;
            if (this.notes[id]) {
              index = this.notes[id].index;
              this.notes[id].refs.push(++this.refIndex);
            }
            chunk += '<a' +
                (index ?
                    (' id="' + opts.generalPrefix + 'ref-footnote-' +
                        this.refIndex + '"') :
                    '') +
                ' class="' + opts.generalPrefix + 'ref-footnote"' +
                (index ?
                    (' href="#' + opts.generalPrefix + 'footnote-' + index +
                        '"') :
                    '') +
                '><sup>' + index + '</sup></a>';
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'image':
          if (matches = rule.exec(src)) {
            if (matches[2] || matches[4] || matches[6]) {
              break;
            }
            src = src.substr(matches[0].length);
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              chunk += this.wrap(matches[1].replace(reEscape2, '$1'), null, true);
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            var text = this.wrap(matches[1].replace(reEscape2, '$1'), null, true);
            var id = (matches[3] || '').replace(reEscape2, '$1');
            var uri = (matches[5] || '').replace(reEscape2, '$1');
            var title = '';
            var width = '';
            var height = '';
            var align = '';
            if (uri) {
              uri = escape(this.shapeUri(this.wrap(uri, null, true)));
            } else {
              id = this.wrap(id, null, true).toLowerCase();
              if (this.images[id]) {
                uri = this.shapeUri(this.images[id].href);
                title = this.images[id].title;
                width = this.filterCss(this.images[id].width);
                height = this.filterCss(this.images[id].height);
                align = this.images[id].align;
              }
            }
            var style = '';
            if (opts.stylish && (width || height)) {
              style = ' style="' + 
                  (align ? ('float:' + escape(align) + ';') : '') +
                  (width ? ('width:' + escape(width) + ';') : '') +
                  (height ? ('height:' + escape(height) + ';') : '') +
                  '"';
            }
            chunk += '<img src="' + escape(uri) + '"' +
                (text ? (' alt="' + escape(text) + '"') : '') +
                (title ? (' title="' + escape(title) + '"') : '') +
                ((!opts.stylish && align) ?  (' align="' + align + '"') : '') +
                (opts.stylish ? style :
                    ((width ? (' width="' + escape(width) + '"') : '') +
                     (height ? (' height="' + escape(height) + '"') : ''))) +
                (!opts.xhtml ? '>' : '/>');
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'anchor':
        case 'ref':
          if (matches = rule.exec(src)) {
            if (matches[2]) {
              break;
            }
            src = src.substr(matches[0].length);
            if (alt) {
              chunk = this.wrap(chunk, null, true);
              chunk += this.translate(matches[1], null, true);
              res += chunk;
              chunk = '';
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            var text = matches[1];
            var id = this.translate(text, null, true).
                replace(/  */g, '-').
                toLowerCase();
            if (k === 'anchor') {
              chunk += '<a class="' + opts.generalPrefix + 'anchor" id="' +
                  opts.generalPrefix + 'anchor-' + escape(id) + '"></a>' +
                  this.translate(text);
            } else {
              chunk += '<a class="' + opts.generalPrefix +
                  'ref-anchor" href="#' + opts.generalPrefix + 'anchor-' +
                  escape(id) + '">' + this.translate(text) + '</a>';
            }
            res += chunk;
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        case 'comment':
        case 'tag':
          if (matches = rule.exec(src)) {
            src = src.substr(matches[0].length);
            if (alt) {
              continue OUTER_LOOP;
            }
            chunk = this.wrap(this.abbr(escape(chunk, true)), inParagraph);
            res += chunk + matches[0];
            chunk = '';
            continue OUTER_LOOP;
          }
          break;

        default:
          throw new Error('Format "' + k + '" does not have a handler.');
          break;
      }
    }
    chunk += src.charAt(0);
    src = src.substr(1);
  }
  if (chunk) {
    if (alt) {
      res += this.wrap(chunk, null, true);
    } else {
      res += this.wrap(this.abbr(escape(chunk, true)), inParagraph);
    }
  }
  return res;
};

InlineLexer.prototype.wrap = function (html, inParagraph, alt) {
  if (this.nowrap) {
    return html;
  }
  var opts = this.options;
  switch (opts.wrappingMode) {
    case 'default':
      if (!alt) {
        html = html.
            replace(/\\\n/g, !opts.xhtml ? '<br>' : '<br/>').
            replace(/\n/g, ' ');
      } else {
        html = html.
            replace(/\\\n/g, '\r').
            replace(/\n/g, ' ').
            replace(/\r/g, '\n');
      }
      break;
    case 'break':
      if (!alt) {
        html = html.split('\n').join(!opts.xhtml ? '<br>\n' : '<br/>\n');
      }
      break;
    case 'paragraph':
      if (!alt) {
        if (inParagraph) {
          html = html.split('\n').join('</p>\n<p>');
        } else {
          html = html.split('\n').join(!opts.xhtml ? '<br>\n' : '<br/>\n');
        }
      }
      break;
    case 'ignore':
      if (!alt) {
        html = html.
            replace(/\\\n/g, !opts.xhtml ? '<br>' : '<br/>').
            replace(/\n/g, '');
      } else {
        html = html.replace(/\\(\n)|\n/g, '$1');
      }
      break;
    default:
      throw new Error('Invalid wrapping mode: "' + opts.wrappingMode + '"');
      break;
  }
  return html;
};

InlineLexer.prototype.abbr = function (text) {
  var regexSource = [];
  var sets = {};
  for (var k in this.abbrs) {
    var word = escape(k, true);
    sets[word] = this.abbrs[k];
    regexSource.push(quotemeta(word));
  }
  if (!regexSource.length) {
    return text;
  }
  var regex = new RegExp(regexSource.join('|'), 'g');
  var self = this;
  return text.replace(regex, function (m) {
    return '<abbr title="' + self.wrap(escape(sets[m]), null, true) + '">' + m +
        '</abbr>';
  });
};

InlineLexer.prototype.shapeUri = function (uri, auto) {
  var baseUri = this.options.baseUri;
  if (!auto || !baseUri) {
    return this.filterUri(uri);
  }
  /**
   * Scheme Component:
   * https://tools.ietf.org/html/rfc2396#section-3.1
   *
   * Resolving Relative References to Absolute Form
   * https://tools.ietf.org/html/rfc2396#section-5.2
   */
  if (!/^[A-Za-z][+\-.0-9A-Za-z]*:/.test(uri)) {
    if (uri.substr(0, 2) === '//') {
      uri = (baseUri.match(/^[^:]+:/) || [''])[0] + uri;
    } else if ((uri.charAt(0) === '?') || (uri.charAt(0) === '#')) {
      uri = baseUri + uri;
    } else if (uri.charAt(0) === '/') {
      uri = (baseUri.match(/^[^:]+:\/\/[^\/]+/) || [''])[0] + uri;
    } else {
      uri = baseUri.replace(/^([^:]+:\/\/[\s\S]+)\/[^\/]*$/, '$1') + '/' + uri;
    }
  }
  return this.filterUri(uri);
};

/**
 * filters the uri before character escaping (e.g. & --> &amp;)
 */
InlineLexer.prototype.filterUri = function (uri) {
  if (!this.options.sanitize) {
    return uri;
  }
  /**
   * An example: <a href="&#x9;java&#x9;script&#x9;:alert(1%29">XSS</a>
   */
  return uri.
      replace(/( )|\s/g, '$1').
      replace(/^\s*javascript\s*:/i, 'XSS');
};

/**
 * filters the CSS before character escaping
 */
InlineLexer.prototype.filterCss = function (style) {
  if (!this.options.sanitize) {
    return style;
  }
  /**
   * old IEs allow "width: expression(alert(1))"
   */
  return style.replace(/\s/g, '').replace(/expression/i, 'XSS');
};


/******************************************************************************\
 * Parser
\******************************************************************************/

/**
 * @constructor
 * @type {function(new:Parser, Object=)}
 */
var Parser = function (opts) {
  this.options = merge({}, strictdown.defaults, opts || {});
  this.options.generalPrefix = escape(this.options.generalPrefix);
  this.options.languagePrefix = escape(this.options.languagePrefix);
  /**
   * states
   */
  this.token = null;
  this.headingIndex = 1;
};

/**
 * static parse method
 * @param {Array.<Object>} tokens
 * @param {Object=} opts
 * @default undefined
 * @return {string}
 */
Parser.parse = function (tokens, opts) {
  var parser = new Parser(opts);
  return parser.parse(tokens);
};

Parser.prototype.parse = function (tokens) {
//%	console.time('Total translation time');
  this.inlineLexer = new InlineLexer({
    links: tokens.links,
    images: tokens.images,
    abbrs: tokens.abbrs,
    notes: tokens.notes,
    headings: tokens.headings
  }, this.options);
  tokens.reverse();
  this.tokens = tokens;
  var res = '';
  while (this.next()) {
    res += this.translate(true);
  }
  res += this.generateFootnote(this.tokens.notes);
//%	console.timeEnd('Total translation time');
  if (res.charAt(0) === '\n') {
    return res.substr(1);
  }
  return res;
};

Parser.prototype.next = function () {
  return this.token = this.tokens.pop();
};

/**
 * tokenizes inline text and parse it into HTML text
 * @param {boolean} top whether parsing top level block elements
 * @return {string}
 */
Parser.prototype.translate = function (top) {
  var opts = this.options;
  var token = this.token;
  var res = token.text || '';
  switch (token.type) {

    case 'p':
      res = '\n<p>' + this.inlineLexer.translate(res, true) + '</p>';
      break;

    case 'code':
      var escaped = token.escaped;
      var lang = token.lang;
      if (opts.sanitize &&
          (token.raw && !opts.highlight)) {
        token.raw = token.mix = false;
      }
      if (opts.highlight && !token.mix && !escaped) {
        var html = opts.highlight(res, lang, token.raw);
        if (html) {
          escaped = true;
          res = html;
        }
      }
      if (!token.raw) {
        if (!lang) {
          res = '<pre>' + (escaped ? res : escape(res)) + '</pre>';
        } else {
          res = '<pre class="' + opts.languagePrefix +
              escape(!opts.sanitize ? lang : lang.replace(/  */g, '-')) + '">' +
              (escaped ? res : escape(res)) + '</pre>';
        }
      } else if (token.mix) {
        this.inlineLexer.nowrap = true;
        res = this.inlineLexer.translate(res);
        this.inlineLexer.nowrap = false;
      }  // else: keeps res as raw HTML code
      res = '\n' + res;
      break;

    case 'heading':
      res = this.inlineLexer.translate(res);
      var attrId = top ?
          (' id="' + opts.generalPrefix + 'heading-' + (this.headingIndex++) +
              '"') : '';
      var size = (token.size + opts.headingBase - 1);
      if (size <= 6) {
        res = '\n<h' + size + attrId + '>' + res + '</h' + size + '>';
      } else {
        res = '\n<p' + attrId + ' class="' + opts.generalPrefix + 'heading-' +
            token.size + '">' + res + '</p>';
      }
      break;

    case 'figure':
      var style = '';
      var width = this.inlineLexer.filterCss(token.width);
      var height = this.inlineLexer.filterCss(token.height);
      var align = token.align;
      if (opts.stylish && (width || height || align)) {
        style = ' style="' +
            (align ? ('float:' + escape(align) + ';') : '') +
            (width ? ('width:' + escape(width) + ';') : '') +
            (height ? ('height:' + escape(height) + ';') : '') +
            '"';
      }
      res = this.inlineLexer.wrap(res.replace(reEscape, '$1'), null, true);
      res = '\n<img src="' + escape(token.href) + '"' +
          (res ? (' alt="' + escape(res) + '"') : '') +
          (token.title ? (' title="' + escape(token.title) + '"') : '') +
          ((!opts.stylish && align) ?
              (' align="' + align + '"') : '') +
          (opts.stylish ? style :
              ((width ? (' width="' + escape(width) + '"') : '') +
               (height ? (' height="' + escape(height) + '"') : ''))) +
          (!opts.xhtml ? '>' : '/>');
      break;

    case 'quote_start':
      res = '\n<blockquote>';
      while (this.next().type !== 'quote_end') {
        res += this.translate();
      }
      res += '\n</blockquote>';
      break;

    case 'li':
      res = this.inlineLexer.translate(res, token.complexMode);
      res = '\n<li>' +
          (token.complexMode ?
              ('\n<p>' + res + '</p>\n</li>') : (res + '</li>'));
      break;

    case 'li_start':
      res = '\n<li>';
      var pos = res.length;
      while (this.next().type !== 'li_end') {
        this.token.complexMode = token.complexMode;
        res += this.translate();
      }
      if (res.charAt(pos) === '\n') {
        res += '\n</li>';
      } else {
        res += '</li>';
      }
      break;

    case 'ul_start':
      res = '\n<ul>';
      while (this.next().type !== 'ul_end') {
        this.token.complexMode = token.complex;
        res += this.translate();
      }
      res += '\n</ul>';
      break;

    case 'ol_start':
      res = '\n<ol>';
      while (this.next().type !== 'ol_end') {
        this.token.complexMode = token.complex;
        res += this.translate();
      }
      res += '\n</ol>';
      break;

    case 'text':
      res = this.inlineLexer.translate(res, token.complexMode);
      if (res && token.complexMode) {
        res = '\n<p>' + res + '</p>';
      }
      break;

    case 'note_start':
      res = '';
      if (this.tokens.notes[token.name].index === token.index) {
        while (this.next().type !== 'note_end') {
          res += this.translate();
        }
        this.tokens.notes[token.name].text = res;
        res = '';
      }
      break;

    case 'td':
    case 'th':
      res = this.inlineLexer.translate(res);
      res = '\n<' + token.type +
          ((token.colspan > 1) ? (' colspan="' + token.colspan + '"') : '') +
          ((token.rowspan > 1) ? (' rowspan="' + token.rowspan + '"') : '') +
          (opts.stylish ?
              (' style="text-align:' + token.align + ';"') :
              (' align="' + token.align + '"')) +
          '>' + res + '</' + token.type + '>';
      break;

    case 'tr_start':
      res = '\n<tr>';
      while (this.next().type !== 'tr_end') {
        res += this.translate();
      }
      res += '\n</tr>';
      break;

    case 'tbody_start':
      res = '\n<tbody>';
      while (this.next().type !== 'tbody_end') {
        res += this.translate();
      }
      res += '\n</tbody>';
      break;

    case 'table_start':
      res = '\n<table>';
      while (this.next().type !== 'table_end') {
        res += this.translate();
      }
      res += '\n</table>';
      break;

    case 'thead_start':
      res = '\n<thead>';
      while (this.next().type !== 'thead_end') {
        res += this.translate();
      }
      res += '\n</thead>';
      break;

    case 'tfoot_start':
      res = '\n<tfoot>';
      while (this.next().type !== 'tfoot_end') {
        res += this.translate();
      }
      res += '\n</tfoot>';
      break;

    case 'hr':
      res = '\n<hr' + (!opts.xhtml ? '>' : '/>');
      break;

    case 'dt':
      res = this.inlineLexer.translate(res);
      res = '\n<dt>' + res + '</dt>';
      break;

    case 'dd':
      res = this.inlineLexer.translate(res, token.complexMode);
      res = '\n<dd>' +
          (token.complexMode ?
              ('\n<p>' + res + '</p>\n</dd>') : (res + '</dd>'));
      break;

    case 'dd_start':
      res = '\n<dd>';
      var pos = res.length;
      while (this.next().type !== 'dd_end') {
        this.token.complexMode = token.complexMode;
        res += this.translate();
      }
      if (res.charAt(pos) === '\n') {
        res += '\n</dd>';
      } else {
        res += '</dd>';
      }
      break;

    case 'dl_start':
      res = '\n<dl>';
      while (this.next().type !== 'dl_end') {
        this.token.complexMode = token.complex;
        res += this.translate();
      }
      res += '\n</dl>';
      break;

    case 'macro':
      var macro = this.options.macros[this.token.name];
      if (macro) {
        res = macro.call(strictdown, this, token);
      } else {
        res = '';
      }
      break;

    default:
      throw new Error('Token "' + this.token.type +
          '" does not have a renderer.');
      break;
  }
  return res;
};

Parser.prototype.generateContents = function (tokens, title) {
  var opts = this.options;
  var lexer = this.inlineLexer;
  var res = '\n<div id="' + opts.generalPrefix + 'contents">' +
      (title ?
          ('\n<div class="' + opts.generalPrefix + 'contents-title">' +
              lexer.translate(title) + '</div>') :
          '');
  var lastSize = 0;
  for (var i = 0, token; token = tokens[i]; i++) {
    var size = token.size;
    if (size > lastSize) {
      for (var j = 0, l = size - lastSize; j < l; j++) {
        if (!j && !lastSize) {
          res += '\n<ul>';
        } else {
          res += '\n<li><ul>';
        }
      }
    } else if (size < lastSize) {
      for (var j = 0, l = lastSize - size; j < l; j++) {
        res += '\n</ul></li>';
      }
    }
    res += '\n<li><a href="#' + opts.generalPrefix + 'heading-' + token.index +
        '">' + escape(lexer.translate(token.text, null, true), true) +
        '</a></li>';
    lastSize = size;
  }
  for (var j = 0, l = lastSize - 1; j <= l; j++) {
    if (j < l) {
      res += '\n</ul></li>';
    } else {
      res += '\n</ul>';
    }
  }
  res += '\n</div>';
  return res.
      replace(/<\/li>\n<li><ul>/g, '\n<ul>').
      replace(/<\/ul><\/li>/g, '</ul>\n</li>');
};

Parser.prototype.generateFootnote = function (tokens) {
  var notes = [];
  for (var k in tokens) {
    notes.push(tokens[k]);
  }
  if (notes.length < 1) {
    return '';
  }
  notes.sort(function (a, b) {
    return (a.index < b.index) ? -1 : 1;
  });
  var opts = this.options;
  var attrTbody = opts.stylish ?
      ' style="vertical-align:top;"' : ' valign="top"';
  var res = '\n<div id="' + opts.generalPrefix + 'footnotes">\n<hr' +
      (!opts.xhtml ? '>' : '/>') + '\n<table>\n<tbody' + attrTbody + '>';
  for (var i = 0, note; note = notes[i]; i++) {
    var attrFootnote = ' class="' + opts.generalPrefix + 'footnote"' +
        ' id="' + opts.generalPrefix + 'footnote-' + note.index + '"';
    var item = '\n<tr' + attrFootnote + '>' +
        '\n<td>[' + note.index + ']</td>\n<td>' +
        (!note.escaped ? this.inlineLexer.translate(note.text) : note.text);
    switch (note.refs.length) {
      case 0: break;
      case 1:
        item += (!note.escaped ? ' <em>' : '\n<p><em>') + '<a class="' +
            opts.generalPrefix + 'footnote-backref" href="#' +
            opts.generalPrefix + 'ref-footnote-' + note.refs[0] +
            '">&#8617;</a>' + (!note.escaped ? '</em>' : '</em></p>');
        break;
      default:
        item += (!note.escaped ? ' <em>' : '\n<p><em>') + '&#8617;(';
        for (var j = 0, l = note.refs.length - 1; j <= l; j++) {
          item += '<a class="' + opts.generalPrefix +
            'footnote-backref" href="#' + opts.generalPrefix + 'ref-footnote-' +
            note.refs[j] + '">' + note.refs[j] + '</a>' + ((j < l) ? ', ' : '');
        }
        item += (!note.escaped ? ')</em>' : ')</em></p>');
        break;
    }
    res += item + (!note.escaped ? '' : '\n') + '</td>\n</tr>';
  }
  return res + '\n</tbody>\n</table>\n</div>';
};


/******************************************************************************\
 * Strictdown
\******************************************************************************/

var strictdown = function (src, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = null;
  }
  if (opts) { opts = merge({}, strictdown.defaults, opts); }

  if (callback) {
    var highlight = opts.highlight;
    var tokens = null;
    try {
      tokens = BlockLexer.lex(src, opts);
    } catch (e) {
      return callback(e);
    }
    var done = function () {
      var result;
      var err;
      try {
        result = Parser.parse(tokens, opts);
      } catch (e) {
        err = e;
      }
      opts.highlight = highlight;  // gives it back to the user :)
      return err ? callback(err) : callback(null, result);
    };
    // tests whether highlight function is asynchronous
    if (!highlight || (highlight.length < 4)) {
      return done();
    }
    delete opts.highlight;  // Parser.parse will use it automatically

    var pending = tokens.length;
    if (!pending) {
      return done();
    }
    for (var i = 0, l = tokens.length; i < l; i++) {
      (function(token) {
        if ((token.type !== 'code') || token.mix || token.escaped) {
          return --pending || done();
        }
        highlight(token.text, token.lang, token.raw, function(err, code) {
          if (err) {
            if ((opts || strictdown.defaults).silent) {
              token.text = '<p>An error occured:</p><pre>' +
                  escape(err.message + '') + '</pre>';
              token.escaped = true;
              return --pending || done();
            }
            throw err;
          }
          if (!code || (code === token.text)) {
            return --pending || done();
          }
          token.text = code;
          token.escaped = true;
          --pending || done();
        });
      })(tokens[i]);
    }
    return;
  }

  try {
    return Parser.parse(BlockLexer.lex(src, opts), opts);
  } catch (e) {
    e.message +=
        '\nPlease report this to https://github.com/jakwings/strictdown/issues';
    if ((opts || strictdown.defaults).silent) {
      return '<p>An error occured:</p><pre>' + escape(e.message + '') +
         '</pre>';
    }
    throw e;
  }
};

/**
 * @expose
 */

strictdown.setOptions = function (opts) {
  merge(strictdown.defaults, opts);
  return strictdown;
};

strictdown.setMacros = function (macros) {
  merge(strictdown.defaults.macros, macros);
  return strictdown;
};

strictdown.defaults = {
  silent: false,  // output no error message
  sanitize: false,  // removes HTML and filters URIs
  pedantic: false,  // always indents with 4 spaces for lists
  hardtab: false,  // replaces every \t with 4 spaces, for pedantic mode
  /**
   * strictdown.js will not check and correct errors for you.  Please follow
   * the XHTML guidelines yourself: http://www.w3.org/TR/xhtml1/#guidelines
   */
  xhtml: false,  // outputs correct end tags <.../> for XHTML
  wrappingMode: 'default',  // default | ignore | break | paragraph
  headingBase: 1,  // h(1-6), headings of smaller size become special paragraphs
  generalPrefix: 'smd-',
  languagePrefix: 'lang-',
  baseUri: '',  // base URI for auto-links
  stylish: true,  // for tables and images
  highlight: null,  // {function(string, string, boolean, function=)}
  macros: {  // Dive into strictdown.js!
    /**
     * @type {function(this:strictdown, object, object)}
     * @param {(BlockLexer|Parser)} processor
     * @param {object} token
     * @return {(object|html)}
     */
    toc: function (processor, token) {
      if (processor instanceof this.BlockLexer) {
        token.text = token.text.replace(reTrim, '$1');
        return token;
      }
      if (processor instanceof this.Parser) {
        return processor.generateContents(processor.tokens.headings,
            token.text);
      }
    }
  }
};

strictdown.helpers = {
  escape: escape,
  quotemeta: quotemeta,
  pad: pad,
  split: split,
  merge: merge,
  reTrim: reTrim,
  reEscape: reEscape,
  reEscape2: reEscape2,
  isIndented: isIndented,
  splitTableRow: splitTableRow
};
strictdown.BlockLexer = BlockLexer;
strictdown.BlockLex = BlockLexer.lex;
strictdown.InlineLexer = InlineLexer;
strictdown.InlineLex = InlineLexer.translate;
strictdown.Parser = Parser;
strictdown.tokenize = BlockLexer.lex;
strictdown.parse = Parser.parse;


/******************************************************************************\
 * exports to web browsers or node applications
\******************************************************************************/
if (typeof exports === 'object') {
  module.exports = strictdown;
} else if (typeof define === 'function' && define.amd) {
  define('strictdown', function () {
    return strictdown;
  });
} else {
  global.strictdown = strictdown;
}

})(this);