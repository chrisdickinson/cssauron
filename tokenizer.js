module.exports = tokenize

var through = require('through')

var _ = 0
  , READY = '(ready)'
  , ANY_CHILD = 'any-child'
  , OPERATION = 'op'
  , ATTR = 'attr'
  , ATTR_START = _++
  , ATTR_COMP = _++
  , ATTR_END = _++
  , PSEUDOSTART = _++
  , PSEUDOCLASS = ':'
  , PSEUDOPSEUDO = '::'
  , CLASS = 'class'
  , ID = 'id'
  , TAG = 'tag'
  , STAR = '*'

function tokenize() {
  var state = READY 
    , data = []
    , idx = 0
    , gathered = []
    , escaped = false
    , lhs, cmp
    , stream
    , length
    , quote
    , c

  return stream = through(ondata, onend)

  function ondata(chunk) {
    data = data.concat(chunk.split(''))
    length = data.length

    while(idx < length && (c = data[idx++])) switch(state) {
      case READY: state_ready(); break 
      case ANY_CHILD: state_any_child(); break
      case OPERATION: state_op(); break
      case ATTR_START: state_attr_start(); break
      case ATTR_COMP: state_attr_compare(); break
      case ATTR_END: state_attr_end(); break
      case PSEUDOCLASS:
      case PSEUDOPSEUDO: state_pseudo(); break
      case PSEUDOSTART: state_pseudostart(); break
      case ID:
      case TAG: 
      case CLASS: state_gather(); break
    }

    data = data.slice(idx)
  }

  function onend(chunk) {
    if(arguments.length) {
      ondata(chunk)
    }

    if(gathered.length) {
      stream.queue(token())
    }
  }

  function state_ready() {
    switch(true) {
      case '#' === c: state = ID; break
      case '.' === c: state = CLASS; break
      case ':' === c: state = PSEUDOCLASS; break
      case '[' === c: state = ATTR_START; break
      case '*' === c: star(); break
      case /[>\+~]/.test(c): state = OPERATION; break
      case /\s/.test(c): state = ANY_CHILD; break 
      case /[\w\d\-_]/.test(c): state = TAG; --idx; break
    }
  }

  function star() {
    state = STAR
    gathered = ['*']
    stream.queue(token())
    state = READY
  }

  function state_op() {
    if(/[>\+~]/.test(c)) return gathered.push(c)
    
    // chomp down the following whitespace.
    if(/\s/.test(c)) return

    stream.queue(token()) 
    state = READY
    --idx
  }

  function state_any_child() {
    if(/\s/.test(c)) return
    if(/[>\+~]/.test(c)) return --idx, state = OPERATION

    stream.queue(token())
    state = READY
    --idx
  }

  function state_pseudo() {
    rhs = state
    state_gather(true)
    if(state !== READY) {
      return
    }

    if(c === '(') {
      lhs = gathered.join('')
      state = PSEUDOSTART
      gathered.length = 0
      ++idx
      return
    }
  }

  function state_pseudostart() {
    if(gathered.length === 0) {
      quote = /['"]/.test(c) ? c : null
      if(quote) return
    }    

    if(quote) {
      if(!escaped && c === quote) {
        quote = null
        return
      }
      if(c === '\\') {
        escaped ? gathered.push(c) : (escaped = true)
        return
      }
      escaped = false
      gathered.push(c)
      return
    }

    state_gather(true)
    if(state !== READY) {
      return
    }
   
    stream.queue({
      type: rhs 
    , data: lhs+'('+gathered.join('')+')'
    })

    state = READY
    lhs = rhs = cmp = null
    gathered.length = 0
    return 
  }

  function state_attr_start() {
    state_gather(true)
    if(state !== READY) {
      return
    }

    if(c === ']') {
      state = ATTR
      stream.queue(token())
      state = READY
      return
    }

    lhs = gathered.join('')
    gathered.length = 0
    state = ATTR_COMP
  }

  function state_attr_compare() {
    if(/[=~|$^*]/.test(c)) {
      gathered.push(c)
    }

    if(gathered.length === 2 || c === '=') {
      cmp = gathered.join('')
      gathered.length = 0
      state = ATTR_END
      quote = null
      return
    }
  }

  function state_attr_end() {
    if(!gathered.length) {
      quote = /['"]/.test(c) ? c : null
      if(quote) return
    }

    if(quote) {
      if(!escaped && c === quote) {
        quote = null
        return
      }
      if(c === '\\') {
        escaped ? gathered.push(c) : (escaped = true)
        return
      }
      escaped = false
      gathered.push(c)
      return
    }

    state_gather(true)
    if(state !== READY) {
      return
    }
    
    stream.queue({
      type: ATTR
    , data: {
          lhs: lhs
        , rhs: gathered.join('')
        , cmp: cmp 
      }
    })

    state = READY
    lhs = rhs = cmp = null
    gathered.length = 0
    return 
  }

  function state_gather(quietly) {
    if(/[^\d\w\-_]/.test(c) && !escaped) {
      if(c === '\\') escaped = true
      else {
        !quietly && stream.queue(token())
        state = READY
        --idx
      }
      return
    }

    escaped = false
    gathered.push(c)
  }

  function token() {
    var data = gathered.join('')

    gathered.length = 0
    return {
        type: state
      , data: data
    }
  }
}
