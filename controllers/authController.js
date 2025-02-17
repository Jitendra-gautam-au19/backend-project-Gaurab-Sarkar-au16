const { promisify } = require('util')
const jwt = require('jsonwebtoken')
const User = require('./../models/userModel')
const AppError = require('./../utils/appError')

const signToken = id => {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  })
}

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

exports.signup = catchAsync (async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm
  })

  const token = signToken(newUser._id)

  res.status(201).json({
    staus: 'success',
    token,
    data: {
      user: newUser
    }
  })
})

exports.login = catchAsync (async (req, res, next) => {
  const { email,password } = req.body
  console.log(email, password)


  // 1) Check if email and password exist
  if(!email || !password) {
    return next(new AppError('Please provide email and password!', 400))
  }
  // 2)Check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password')
  // console.log(user)
  // const correct = await  user.correctPassword(password, user.password)

  if(!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401))
  }

  // 3)If everything ok, send token to client
  const token = signToken(user._id)
  res.status(200).json({
    status: 'success',
    token
  })
})

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check of its there
  let token
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  }
  // console.log(token)

  if(!token) {
    return next(new AppError('You are not logged in! Please log in to get access', 401))
  }
  // 2)Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET)
  // console.log(decoded)

  // 3)Check if user still exists
  const currentUser = await User.findById(decoded.id)
  if (!currentUser) {
    return next(new AppError('The user belonging to this token does no longer exists.', 401))
  }

  // 4)Check if user changed password after the token was issued
  //iat: issued at   
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password! Please login again.', 401))
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser
  next()
})

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if(!roles.includes(req.user.role)){
       return next(new AppError('You donot have permission to perform this action', 403))
    }
      
    next()
  }
}