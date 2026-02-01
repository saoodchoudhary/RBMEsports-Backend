const Wallet = require('../models/Wallet');
const User = require('../models/User');

// @desc    Get all withdrawal requests
// @route   GET /api/admin/withdrawals
// @access  Private/Admin
exports.getAllWithdrawals = async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const wallets = await Wallet.find({
      'pendingWithdrawals.0': { $exists: true }
    }).populate('userId', 'name email phone bgmiId');
    
    let allWithdrawals = [];
    
    wallets.forEach(wallet => {
      wallet.pendingWithdrawals.forEach(withdrawal => {
        if (!status || withdrawal.status === status) {
          allWithdrawals.push({
            ...withdrawal.toObject(),
            walletId: wallet._id,
            user: wallet.userId
          });
        }
      });
    });
    
    // Sort by date
    allWithdrawals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    
    res.status(200).json({
      success: true,
      count: allWithdrawals.length,
      data: allWithdrawals
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Process withdrawal
// @route   PUT /api/admin/withdrawals/:walletId/:withdrawalId
// @access  Private/Admin
exports.processWithdrawal = async (req, res, next) => {
  try {
    const { walletId, withdrawalId } = req.params;
    const { status, transactionId, rejectionReason } = req.body;
    
    const wallet = await Wallet.findById(walletId);
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }
    
    const withdrawal = wallet.pendingWithdrawals.id(withdrawalId);
    
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }
    
    if (status === 'completed') {
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
      withdrawal.processedBy = req.user.id;
      withdrawal.transactionId = transactionId;
      
      // Add to transactions
      wallet.transactions.push({
        type: 'withdrawal',
        amount: -withdrawal.amount,
        description: `Withdrawal processed - ${withdrawal.method}`,
        status: 'completed',
        createdAt: new Date()
      });
      
      wallet.totalWithdrawn += withdrawal.amount;
      
    } else if (status === 'rejected') {
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();
      withdrawal.processedBy = req.user.id;
      withdrawal.rejectionReason = rejectionReason;
      
      // Return money to wallet
      wallet.balance += withdrawal.amount;
      
      wallet.transactions.push({
        type: 'refund',
        amount: withdrawal.amount,
        description: `Withdrawal rejected - ${rejectionReason}`,
        status: 'completed',
        createdAt: new Date()
      });
    }
    
    await wallet.save();
    
    res.status(200).json({
      success: true,
      message: `Withdrawal ${status}`,
      data: wallet
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get wallet stats
// @route   GET /api/admin/wallet-stats
// @access  Private/Admin
exports.getWalletStats = async (req, res, next) => {
  try {
    const totalWallets = await Wallet.countDocuments();
    
    const stats = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalDeposited: { $sum: '$totalDeposited' },
          totalWithdrawn: { $sum: '$totalWithdrawn' },
          totalEarned: { $sum: '$totalEarned' }
        }
      }
    ]);
    
    const pendingWithdrawals = await Wallet.aggregate([
      { $unwind: '$pendingWithdrawals' },
      { $match: { 'pendingWithdrawals.status': 'pending' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$pendingWithdrawals.amount' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        totalWallets,
        totalBalance: stats[0]?.totalBalance || 0,
        totalDeposited: stats[0]?.totalDeposited || 0,
        totalWithdrawn: stats[0]?.totalWithdrawn || 0,
        totalEarned: stats[0]?.totalEarned || 0,
        pendingWithdrawals: {
          count: pendingWithdrawals[0]?.count || 0,
          amount: pendingWithdrawals[0]?.totalAmount || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};