module.exports = language

var tokenizer = require('./tokenizer')

function language(lookups) {
  return function(selector) {
    return parse(selector, remap(lookups))
  }
}

function remap(opts) {
  for(var key in opts) if(opts.hasOwnProperty(key) && typeof opts[key] === 'string') {
    opts[key] = Function('return function(node, attr) { return node.'+opts[key]+' }')()
  }

  return opts
}

function parse(selector, options) {
  var bits = []
    , stream = tokenizer()
    , traversal
    , length

  traversal = {
    '': any_parents
  , '>': direct_parent
  , '+': direct_sibling
  , '~': any_sibling
  }

  stream
    .on('data', group)
    .end(selector)   

  length = bits.length

  function group(token) {
    if(token.type === 'op' || token.type === 'any-child') {
      bits.unshift(traversal[token.data])
      bits.unshift(check())
      return
    }

    (bits[0] = bits[0] || check()).bits.push(
      token.type === 'attr' ? attr(token) :
      token.type === ':' || token.type === '::' ? pseudo(token) :
      token.type === '*' ? function(node) { return !!node } :
      matches(token.type, token.data)
    )
  }

  return function(node) {
    var current = entry

    for(var i = 0; i < length; i += 2) {
      node = current(node, bits[i])
      if(!node) return false

      current = bits[i + 1]
    }
    return true
  }

  function check() {
    _check.bits = []
    _check.push = function(token) {
      _check.bits.push(token)
    }
    return _check

    function _check(node) {
      for(var i = 0, len = _check.bits.length; i < len; ++i) {
        if(!_check.bits[i](node)) return false
      }
      return true
    }
  }

  function attr(token) {
    return token.data.lhs ?
      valid_attr(options.attr, token.data.lhs, token.data.cmp, token.data.rhs) :
      valid_attr(options.attr, token.data)
  }

  function matches(type, data) {
    return function(node) {
      return options[type](node) == data
    }
  }

  function any_parents(node, next) {
    do { 
      node = options.parent(node)
    } while(node && !next(node))

    return node
  }

  function direct_parent(node, next) {
    node = options.parent(node)
    return node && next(node) ? node : null
  }

  function direct_sibling(node, next) {
    var parent = options.parent(node)
      , children = options.children(parent)
      , idx = 0

    for(var i = 0, len = children.length; i < len; ++i) {
      if(children[i] === node) {
        idx = i
        break
      }
    }

    return children[idx - 1] && next(children[idx - 1]) ? children[idx - 1] : null
  }

  function any_sibling(node, next) {
    var parent = options.parent(node)
      , children = options.children(parent)

    for(var i = 0, len = children.length; i < len; ++i) {
      if(children[i] === node) return null
      if(next(children[i])) return children[i]
    }

    return null
  }

  function pseudo(token) {
    return valid_pseudo(options, token.data)
  }

}

function entry(node, next) {
  return next(node) ? node : null
}

function valid_pseudo(options, match) {
  switch(match) {
    case 'empty': return valid_empty(options)
    case 'first-child': return valid_first_child(options)
    case 'last-child': return valid_last_child(options)
    case 'root': return valid_root(options)
  }

  if(match.indexOf('contains') !== 0) {
    return function() { return false }
  }

  return valid_contains(options, match.slice(9, -1))
}

function valid_attr(fn, lhs, cmp, rhs) {
  return function(node) {
    var attr = fn(node, lhs)
    if(!cmp) return !!attr
    if(cmp.length == 1) return attr == rhs

    return checkattr[cmp.charAt(0)](attr, rhs)
  }
}

function valid_first_child(options) {
  return function(node) {
    return options.children(options.parent(node))[0] === node
  }
}

function valid_last_child(options) {
  return function(node) {
    var children = options.children(options.parent(node))
    return children[children.length - 1] === node
  }
}

function valid_empty(options) {
  return function(node) {
    return options.children(node).length === 0
  }
}

function valid_root(options) {
  return function(node) {
    return !options.parent(node)
  }
}

function valid_contains(options, contents) {
  return function(node) {
    return options.contents(node).indexOf(contents) !== -1
  }
}

var checkattr = {
  '$': function(l, r) { return l.slice(l.length - r.length) === r }
, '^': function(l, r) { return l.slice(0, r.length) === r }
, '*': function(l, r) { return l.indexOf(r) > -1 }
, '~': function(l, r) { return l.split(/\s+/).indexOf(r) > -1 }
, '|': function(l, r) { return l.split('-').indexOf(r) > -1 }
}
